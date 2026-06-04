# Copyright (c) 2026 zmkay
# SPDX-License-Identifier: MIT

if(CONFIG_ZMKAY_USB_DFU_RESET)
  zephyr_library()
  zephyr_library_sources(src/usb_dfu_reset.c)
endif()
