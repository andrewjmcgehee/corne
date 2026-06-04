/*
 * Copyright (c) 2026 zmkay
 * SPDX-License-Identifier: MIT
 *
 * Watches a USB CDC-ACM port for the "1200bps touch" — the host opening the
 * port at 1200 baud — and on seeing it, reboots into the nRF52 UF2 bootloader
 * via sys_reboot(RST_UF2). This is the same auto-reset trick Arduino/Adafruit
 * boards use; ZMK doesn't ship it. It lets a host tool drive either Corne half
 * into DFU over USB with no physical double-tap reset.
 *
 * On the peripheral half ZMK leaves USB off (CONFIG_ZMK_USB is central-only),
 * so we bring the stack up ourselves; on the central half ZMK already enabled
 * it and we just attach the watcher.
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>
#include <zephyr/sys/reboot.h>
#include <zephyr/usb/usb_device.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(usb_dfu_reset, CONFIG_ZMK_LOG_LEVEL);

/* RST_UF2 from zmk/app/include/dt-bindings/zmk/reset.h — GPREGRET magic the
 * Adafruit nRF52 bootloader reads to stay in UF2/DFU mode. */
#define DFU_RST_UF2 0x57
#define DFU_MAGIC_BAUD 1200U

static const struct device *const dfu_uart = DEVICE_DT_GET(DT_CHOSEN(zmkay_dfu_uart));

static void usb_dfu_reset_watch(void *a, void *b, void *c) {
    ARG_UNUSED(a);
    ARG_UNUSED(b);
    ARG_UNUSED(c);

#if !IS_ENABLED(CONFIG_ZMK_USB)
    /* Peripheral: ZMK won't bring USB up, so do it ourselves. */
    int err = usb_enable(NULL);
    if (err != 0 && err != -EALREADY) {
        LOG_ERR("usb_enable failed: %d", err);
    }
#endif

    if (!device_is_ready(dfu_uart)) {
        LOG_ERR("DFU CDC uart not ready; watcher exiting");
        return;
    }

    while (true) {
        uint32_t baud = 0;
        if (uart_line_ctrl_get(dfu_uart, UART_LINE_CTRL_BAUD_RATE, &baud) == 0 &&
            baud == DFU_MAGIC_BAUD) {
            LOG_INF("1200bps touch on DFU port -> rebooting to UF2 bootloader");
            /* Let the host finish closing the port before we drop off the bus. */
            k_msleep(50);
            sys_reboot(DFU_RST_UF2);
        }
        k_msleep(100);
    }
}

K_THREAD_DEFINE(usb_dfu_reset_tid, 768, usb_dfu_reset_watch, NULL, NULL, NULL,
                K_PRIO_PREEMPT(10), 0, 0);
