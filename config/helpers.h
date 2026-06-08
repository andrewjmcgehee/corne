#pragma once

#define ___ &trans
#define xxx &none

#define LT0  5
#define LT1  4
#define LT2  3
#define LT3  2
#define LT4  1
#define LT5  0

#define RT0  6
#define RT1  7
#define RT2  8
#define RT3  9
#define RT4 10
#define RT5 11

#define LM0 17
#define LM1 16
#define LM2 15
#define LM3 14
#define LM4 13
#define LM5 12

#define RM0 18
#define RM1 19
#define RM2 20
#define RM3 21
#define RM4 22
#define RM5 23

#define LB0 29
#define LB1 28
#define LB2 27
#define LB3 26
#define LB4 25
#define LB5 24

#define RB0 30
#define RB1 31
#define RB2 32
#define RB3 33
#define RB4 34
#define RB5 35

#define LH0 38
#define LH1 37
#define LH2 36

#define RH0 39
#define RH1 40
#define RH2 41

#define KEYS_L LT0 LT1 LT2 LT3 LT4 LT5 LM0 LM1 LM2 LM3 LM4 LM5 LB0 LB1 LB2 LB3 LB4 LB5
#define KEYS_R RT0 RT1 RT2 RT3 RT4 RT5 RM0 RM1 RM2 RM3 RM4 RM5 RB0 RB1 RB2 RB3 RB4 RB5
#define THUMBS_L LH0 LH1 LH2
#define THUMBS_R RH0 RH1 RH2
#define THUMBS THUMBS_L THUMBS_R

// behavior
#define ZMK_BEHAVIOR_CORE_hold_tap \
    compatible = "zmk,behavior-hold-tap"; \
    #binding-cells = <2>

#define ZMK_BEHAVIOR(name, type, ...) \
    / { \
        behaviors { \
            name: name { \
                ZMK_BEHAVIOR_CORE_ ## type; \
                __VA_ARGS__ \
            }; \
        }; \
    };

#define ZMK_HOLD_TAP(name, ...) ZMK_BEHAVIOR(name, hold_tap, __VA_ARGS__)

#define HOME_ROW_MOD(NAME, HOLD, TAP, TRIGGER_POS)                             \
  ZMK_HOLD_TAP(NAME, bindings = <HOLD>, <TAP>; flavor = "balanced";            \
               tapping-term-ms = <280>; quick-tap-ms = <120>;         \
               require-prior-idle-ms = <150>; hold-trigger-on-release;         \
               hold-trigger-key-positions = <TRIGGER_POS>;)
