// Native BLE transport for the ZMK Studio RPC service.
//
// ZMK guards the Studio characteristic with BT_GATT_PERM_*_ENCRYPT, so it only
// talks over an encrypted/bonded link. Rather than scan for an advertising
// (unpaired) device — which can't be bonded and so never answers — we reach the
// keyboard while it's in its NORMAL state: already paired and connected to this
// Mac. CoreBluetooth's retrieveConnectedPeripherals (via bluest's
// connected_devices_with_services) hands us that peripheral, and the existing
// system bond makes the encrypted Studio characteristic readable. No advertising,
// no re-pairing, works every session.
//
// Bridged to JS as an RpcTransport: ble_list (connected keyboards), ble_connect
// (discover + enable indications, pumped as `ble://rx`), ble_send, ble_disconnect.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use bluest::{Adapter, Characteristic, Device, Uuid};
use futures::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use tokio::time::timeout;

const SERVICE_UUID: Uuid = Uuid::from_u128(0x0000_0000_0196_6107_c967_c5cf_b1c2_482a);
const RPC_CHRC_UUID: Uuid = Uuid::from_u128(0x0000_0001_0196_6107_c967_c5cf_b1c2_482a);
// Standard HID-over-GATT service — keyboards connected to the Mac expose it.
const HID_SERVICE_UUID: Uuid = Uuid::from_u128(0x0000_1812_0000_1000_8000_0080_5f9b_34fb);

#[derive(Default)]
struct Inner {
    adapter: Option<Adapter>,
    /// Devices from the most recent ble_list, keyed by their id string.
    known: HashMap<String, Device>,
    device: Option<Device>,
    rpc_char: Option<Characteristic>,
    pump: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Default)]
pub struct BleState {
    inner: Mutex<Inner>,
}

#[derive(Serialize, Clone)]
pub struct DeviceInfo {
    id: String,
    name: String,
    /// The system already knows this device exposes the Studio service.
    has_studio_adv: bool,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn device_id(d: &Device) -> String {
    format!("{:?}", d.id())
}

async fn ensure_adapter(state: &State<'_, BleState>) -> Result<Adapter, String> {
    if let Some(a) = &state.inner.lock().await.adapter {
        return Ok(a.clone());
    }
    let adapter = Adapter::default()
        .await
        .ok_or_else(|| "No Bluetooth adapter found".to_string())?;
    adapter.wait_available().await.map_err(err)?;
    state.inner.lock().await.adapter = Some(adapter.clone());
    Ok(adapter)
}

#[tauri::command]
pub async fn ble_list(state: State<'_, BleState>) -> Result<Vec<DeviceInfo>, String> {
    let adapter = ensure_adapter(&state).await?;

    // Keyboards currently connected to this Mac over the system bond.
    let hid = adapter
        .connected_devices_with_services(&[HID_SERVICE_UUID])
        .await
        .map_err(err)?;
    // Devices the system already knows expose the Studio service (often none,
    // since macOS only discovers HID for a keyboard — flag them when present).
    let studio = adapter
        .connected_devices_with_services(&[SERVICE_UUID])
        .await
        .unwrap_or_default();
    let studio_ids: HashSet<String> = studio.iter().map(device_id).collect();

    let mut known = HashMap::new();
    let mut out = Vec::new();
    for d in hid.into_iter().chain(studio.into_iter()) {
        let id = device_id(&d);
        if known.contains_key(&id) {
            continue;
        }
        let name = d.name().unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        out.push(DeviceInfo {
            has_studio_adv: studio_ids.contains(&id),
            id: id.clone(),
            name,
        });
        known.insert(id, d);
    }
    state.inner.lock().await.known = known;
    out.sort_by_key(|d| !d.has_studio_adv);
    Ok(out)
}

#[tauri::command]
pub async fn ble_connect(
    app: AppHandle,
    state: State<'_, BleState>,
    id: String,
) -> Result<DeviceInfo, String> {
    let adapter = ensure_adapter(&state).await?;

    // Tear down any prior session first. Reusing a stale connection/subscription
    // across reconnects can leave the device's indications un-rearmed (tx but no
    // rx), so we drop our central's link and re-subscribe fresh every time.
    let stale = {
        let mut inner = state.inner.lock().await;
        if let Some(p) = inner.pump.take() {
            p.abort();
        }
        inner.rpc_char = None;
        inner.device.take()
    };
    if let Some(old) = stale {
        let _ = adapter.disconnect_device(&old).await;
    }

    let device = state
        .inner
        .lock()
        .await
        .known
        .get(&id)
        .cloned()
        .ok_or_else(|| "Device not in list — refresh and try again".to_string())?;

    // Ensure our central has a session to the (system-connected) peripheral.
    timeout(Duration::from_secs(20), adapter.connect_device(&device))
        .await
        .map_err(|_| "Timed out connecting".to_string())?
        .map_err(err)?;
    eprintln!("[ble] connected; discovering Studio service");

    let service = timeout(
        Duration::from_secs(20),
        device.discover_services_with_uuid(SERVICE_UUID),
    )
    .await
    .map_err(|_| "Timed out discovering services".to_string())?
    .map_err(err)?
    .into_iter()
    .next()
    .ok_or_else(|| "That device has no ZMK Studio service".to_string())?;

    let rpc = service
        .discover_characteristics_with_uuid(RPC_CHRC_UUID)
        .await
        .map_err(err)?
        .into_iter()
        .find(|c| c.uuid() == RPC_CHRC_UUID)
        .ok_or_else(|| "No Studio RPC characteristic".to_string())?;
    eprintln!("[ble] found RPC characteristic; enabling indications");

    // Pump indications to the JS readable stream. notify() enables the CCC and
    // returns a stream; the task owns a clone of the characteristic so the
    // stream's borrow stays valid for its lifetime. We signal `ready` only once
    // indications are actually enabled — JS must not send any RPC before then,
    // or the device's reply to the first request is dropped (it has nowhere to
    // indicate to yet).
    let rpc_for_pump = rpc.clone();
    let app_for_pump = app.clone();
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let pump = tokio::spawn(async move {
        let mut updates = match rpc_for_pump.notify().await {
            Ok(s) => {
                let _ = ready_tx.send(Ok(()));
                s
            }
            Err(e) => {
                let _ = ready_tx.send(Err(e.to_string()));
                let _ = app_for_pump.emit("ble://disconnected", ());
                return;
            }
        };
        eprintln!("[ble] indications enabled");
        while let Some(item) = updates.next().await {
            match item {
                Ok(bytes) => {
                    let _ = app_for_pump.emit("ble://rx", bytes);
                }
                Err(e) => {
                    eprintln!("[ble] indication error: {e}");
                    break;
                }
            }
        }
        eprintln!("[ble] indication stream ended");
        let _ = app_for_pump.emit("ble://disconnected", ());
    });

    // Block returning until indications are live (or fail fast).
    match timeout(Duration::from_secs(10), ready_rx).await {
        Ok(Ok(Ok(()))) => {}
        Ok(Ok(Err(e))) => return Err(format!("Couldn't enable indications: {e}")),
        _ => {
            pump.abort();
            return Err("Timed out enabling indications".to_string());
        }
    }

    let name = device.name().unwrap_or_default();
    {
        let mut inner = state.inner.lock().await;
        if let Some(old) = inner.pump.take() {
            old.abort();
        }
        inner.device = Some(device);
        inner.rpc_char = Some(rpc);
        inner.pump = Some(pump);
    }
    eprintln!("[ble] connect complete: {name}");

    Ok(DeviceInfo {
        id,
        name,
        has_studio_adv: true,
    })
}

#[tauri::command]
pub async fn ble_send(state: State<'_, BleState>, data: Vec<u8>) -> Result<(), String> {
    let rpc = state
        .inner
        .lock()
        .await
        .rpc_char
        .clone()
        .ok_or_else(|| "Not connected".to_string())?;
    // ZMK's RPC characteristic is Write-WITH-response (BT_GATT_CHRC_WRITE only);
    // a write-without-response is silently dropped by CoreBluetooth, so the
    // device never sees the frame.
    rpc.write(&data).await.map_err(err)
}

#[tauri::command]
pub async fn ble_disconnect(state: State<'_, BleState>) -> Result<(), String> {
    let (pump, device, adapter) = {
        let mut inner = state.inner.lock().await;
        inner.rpc_char = None;
        (inner.pump.take(), inner.device.take(), inner.adapter.clone())
    };
    if let Some(p) = pump {
        p.abort();
    }
    // Release our central's link so the next connect re-subscribes cleanly. This
    // only drops OUR session — the keyboard stays bonded/connected to the OS for
    // typing.
    if let (Some(adapter), Some(device)) = (adapter, device) {
        let _ = adapter.disconnect_device(&device).await;
    }
    Ok(())
}
