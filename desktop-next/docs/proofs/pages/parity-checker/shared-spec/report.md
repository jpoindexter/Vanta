# Pages parity (shared checker, fixtures harness)

Spec: docs/parity/wireframe-spec.json. Keys judged: 50. Rows: 1022 => {"FAIL":242,"ALLOWED":206,"PASS":574}.

| State | PASS | FAIL | ALLOWED | UNMAPPED |
|---|---|---|---|---|
| w1440.view-home | 31 | 52 | 1 | 0 |
| w1440.view-schedules | 31 | 12 | 5 | 0 |
| w1440.view-connections | 31 | 16 | 5 | 0 |
| w1440.view-skills | 31 | 16 | 5 | 0 |
| w1440.view-outputs | 31 | 12 | 5 | 0 |
| w1440.wb-changes | 26 | 0 | 13 | 0 |
| w1440.wb-files | 23 | 0 | 11 | 0 |
| w1440.wb-browser | 21 | 0 | 11 | 0 |
| w1440.wb-terminal | 23 | 0 | 11 | 0 |
| w1440.wb-outputs | 24 | 0 | 11 | 0 |
| w1440.palette | 32 | 0 | 30 | 0 |
| w1440.palette-empty | 28 | 0 | 4 | 0 |
| w1440.settings | 32 | 10 | 12 | 0 |
| w1100.wb-changes | 26 | 0 | 13 | 0 |
| w1100.view-home | 31 | 52 | 1 | 0 |
| w1100.settings | 32 | 10 | 12 | 0 |
| w800.wb-changes | 26 | 0 | 13 | 0 |
| w800.view-home | 31 | 52 | 1 | 0 |
| w800.settings | 32 | 10 | 12 | 0 |
| w800.palette | 32 | 0 | 30 | 0 |

## FAIL rows

- w1440.view-home page: h expected 768.5 got 788.33
- w1440.view-home page.column: h expected 724.5 got 744.33
- w1440.view-home list.row[0]: y expected 241.28 got 246.58; h expected 54.69 got 57.59
- w1440.view-home list.row[1]: y expected 295.97 got 304.17; h expected 54.69 got 57.59
- w1440.view-home list.row[2]: y expected 392.95 got 404.06; h expected 54.69 got 57.59
- w1440.view-home list.row[3]: y expected 489.94 got 503.95; h expected 54.69 got 57.59
- w1440.view-home list.row[4]: y expected 544.63 got 561.55; h expected 54.69 got 57.59
- w1440.view-home list.row[5]: y expected 641.61 got 661.44
- w1440.view-home list.row[6]: y expected 690.91 got 710.73
- w1440.view-home list.row[7]: y expected 740.2 got 760.03
- w1440.view-home list.row.title[0]: y expected 249.28 got 254.58; h expected 37.69 got 40.59
- w1440.view-home list.row.title[1]: y expected 303.97 got 312.17; h expected 37.69 got 40.59
- w1440.view-home list.row.title[2]: y expected 400.95 got 412.06; h expected 37.69 got 40.59
- w1440.view-home list.row.title[3]: y expected 497.94 got 511.95; h expected 37.69 got 40.59
- w1440.view-home list.row.title[4]: y expected 552.63 got 569.55; h expected 37.69 got 40.59
- w1440.view-home list.row.title[5]: y expected 655.61 got 675.44
- w1440.view-home list.row.title[6]: y expected 704.91 got 724.73
- w1440.view-home list.row.title[7]: y expected 754.2 got 774.03
- w1440.view-home list.row.note[0]: y expected 270.58 got 277.88
- w1440.view-home list.row.note[1]: y expected 325.27 got 335.47
- w1440.view-home list.row.note[2]: y expected 422.25 got 435.36
- w1440.view-home list.row.note[3]: y expected 519.23 got 535.25
- w1440.view-home list.row.note[4]: y expected 573.92 got 592.84
- w1440.view-home list.row.action[0]: y expected 251.97 got 258.72
- w1440.view-home list.row.action[1]: y expected 251.97 got 258.72
- w1440.view-home list.row.action[2]: y expected 306.66 got 316.31
- w1440.view-home list.row.action[3]: y expected 403.64 got 416.2
- w1440.view-home list.row.action[4]: y expected 403.64 got 416.2
- w1440.view-home list.row.action[5]: y expected 500.63 got 516.09
- w1440.view-home list.row.action[6]: y expected 555.31 got 573.69
- w1440.view-home list.row.action[7]: y expected 649.61 got 669.44
- w1440.view-home list.row.action[8]: y expected 649.61 got 669.44
- w1440.view-home list.row.action[9]: y expected 698.91 got 718.73
- w1440.view-home list.row.action[10]: y expected 698.91 got 718.73
- w1440.view-home list.row.action[11]: y expected 748.2 got 768.03
- w1440.view-home list.row.action[12]: y expected 748.2 got 768.03
- w1440.view-home home.composer: h expected 98.59 got 103.89
- w1440.view-home home.composer.attach: y expected 122.59 got 127.89
- w1440.view-home home.composer.project: y expected 126.89 got 132.19
- w1440.view-home home.composer.send: y expected 121.59 got 126.89
- w1440.view-home home.projectChip[0]: y expected 178.59 got 183.89
- w1440.view-home home.projectChip[1]: y expected 178.59 got 183.89
- w1440.view-home home.projectChip[2]: y expected 178.59 got 183.89
- w1440.view-home home.section[0]: y expected 213.98 got 219.28; h expected 137.67 got 143.48
- w1440.view-home home.section[1]: y expected 365.66 got 376.77; h expected 82.98 got 85.89
- w1440.view-home home.section[2]: y expected 462.64 got 476.66; h expected 137.67 got 143.48
- w1440.view-home home.section[3]: y expected 614.31 got 634.14
- w1440.view-home home.section.title[0]: y expected 213.98 got 219.28
- w1440.view-home home.section.title[1]: y expected 365.66 got 376.77
- w1440.view-home home.section.title[2]: y expected 462.64 got 476.66
- w1440.view-home home.section.title[3]: y expected 614.31 got 634.14
- w1440.view-home home.needsYou.badge: y expected 214.44 got 219.73
- w1440.view-schedules page: h expected 270.45 got 279.17
- w1440.view-schedules page.column: h expected 226.45 got 235.17
- w1440.view-schedules list.row[0]: h expected 54.69 got 57.59
- w1440.view-schedules list.row[1]: y expected 182.08 got 184.98; h expected 54.69 got 57.59
- w1440.view-schedules list.row[2]: y expected 236.77 got 242.58; h expected 54.69 got 57.59
- w1440.view-schedules list.row.title[0]: h expected 37.69 got 40.59
- w1440.view-schedules list.row.title[1]: y expected 190.08 got 192.98; h expected 37.69 got 40.59
- w1440.view-schedules list.row.title[2]: y expected 244.77 got 250.58; h expected 37.69 got 40.59
- w1440.view-schedules list.row.note[1]: y expected 211.38 got 216.28
- w1440.view-schedules list.row.note[2]: y expected 266.06 got 273.88
- w1440.view-schedules list.row.action[1]: y expected 192.77 got 197.13
- w1440.view-schedules list.row.action[2]: y expected 247.45 got 254.72
- w1440.view-connections page: h expected 325.14 got 336.77
- w1440.view-connections page.column: h expected 281.14 got 292.77
- w1440.view-connections list.row[0]: h expected 54.69 got 57.59
- w1440.view-connections list.row[1]: y expected 182.08 got 184.98; h expected 54.69 got 57.59
- w1440.view-connections list.row[2]: y expected 236.77 got 242.58; h expected 54.69 got 57.59
- w1440.view-connections list.row[3]: y expected 291.45 got 300.17; h expected 54.69 got 57.59
- w1440.view-connections list.row.title[0]: h expected 37.69 got 40.59
- w1440.view-connections list.row.title[1]: y expected 190.08 got 192.98; h expected 37.69 got 40.59
- w1440.view-connections list.row.title[2]: y expected 244.77 got 250.58; h expected 37.69 got 40.59
- w1440.view-connections list.row.title[3]: y expected 299.45 got 308.17; h expected 37.69 got 40.59
- w1440.view-connections list.row.note[1]: y expected 211.38 got 216.28
- w1440.view-connections list.row.note[2]: y expected 266.06 got 273.88
- w1440.view-connections list.row.note[3]: y expected 320.75 got 331.47
- w1440.view-connections list.row.action[1]: y expected 192.77 got 197.13
- w1440.view-connections list.row.action[2]: y expected 247.45 got 254.72
- w1440.view-connections list.row.action[3]: y expected 302.14 got 312.31
- w1440.view-skills page: h expected 325.14 got 336.77
- w1440.view-skills page.column: h expected 281.14 got 292.77
- w1440.view-skills list.row[0]: h expected 54.69 got 57.59
- w1440.view-skills list.row[1]: y expected 182.08 got 184.98; h expected 54.69 got 57.59
- w1440.view-skills list.row[2]: y expected 236.77 got 242.58; h expected 54.69 got 57.59
- w1440.view-skills list.row[3]: y expected 291.45 got 300.17; h expected 54.69 got 57.59
- w1440.view-skills list.row.title[0]: h expected 37.69 got 40.59
- w1440.view-skills list.row.title[1]: y expected 190.08 got 192.98; h expected 37.69 got 40.59
- w1440.view-skills list.row.title[2]: y expected 244.77 got 250.58; h expected 37.69 got 40.59
- w1440.view-skills list.row.title[3]: y expected 299.45 got 308.17; h expected 37.69 got 40.59
- w1440.view-skills list.row.note[1]: y expected 211.38 got 216.28
- w1440.view-skills list.row.note[2]: y expected 266.06 got 273.88
- w1440.view-skills list.row.note[3]: y expected 320.75 got 331.47
- w1440.view-skills list.row.action[1]: y expected 192.77 got 197.13
- w1440.view-skills list.row.action[2]: y expected 247.45 got 254.72
- w1440.view-skills list.row.action[3]: y expected 302.14 got 312.31
- w1440.view-outputs page: h expected 270.45 got 279.17
- w1440.view-outputs page.column: h expected 226.45 got 235.17
- w1440.view-outputs list.row[0]: h expected 54.69 got 57.59
- w1440.view-outputs list.row[1]: y expected 182.08 got 184.98; h expected 54.69 got 57.59
- w1440.view-outputs list.row[2]: y expected 236.77 got 242.58; h expected 54.69 got 57.59
- w1440.view-outputs list.row.title[0]: h expected 37.69 got 40.59
- w1440.view-outputs list.row.title[1]: y expected 190.08 got 192.98; h expected 37.69 got 40.59
- w1440.view-outputs list.row.title[2]: y expected 244.77 got 250.58; h expected 37.69 got 40.59
- w1440.view-outputs list.row.note[1]: y expected 211.38 got 216.28
- w1440.view-outputs list.row.note[2]: y expected 266.06 got 273.88
- w1440.view-outputs list.row.action[1]: y expected 192.77 got 197.13
- w1440.view-outputs list.row.action[2]: y expected 247.45 got 254.72
- w1440.settings settings.row[0]: h expected 54.69 got 57.59
- w1440.settings settings.row[1]: y expected 212.98 got 215.89; h expected 54.69 got 57.59
- w1440.settings settings.row[2]: y expected 267.67 got 273.48; h expected 54.69 got 57.59
- w1440.settings settings.row.title[0]: h expected 37.69 got 40.59
- w1440.settings settings.row.title[1]: y expected 220.98 got 223.89; h expected 37.69 got 40.59
- w1440.settings settings.row.title[2]: y expected 275.67 got 281.48; h expected 37.69 got 40.59
- w1440.settings settings.row.note[1]: y expected 242.28 got 247.19
- w1440.settings settings.row.note[2]: y expected 296.97 got 304.78
- w1440.settings settings.row.action[1]: y expected 223.67 got 228.03
- w1440.settings settings.row.action[2]: y expected 278.36 got 285.63
- w1100.view-home page: h expected 768.5 got 788.33
- w1100.view-home page.column: h expected 724.5 got 744.33
- w1100.view-home list.row[0]: y expected 241.28 got 246.58; h expected 54.69 got 57.59
- w1100.view-home list.row[1]: y expected 295.97 got 304.17; h expected 54.69 got 57.59
- w1100.view-home list.row[2]: y expected 392.95 got 404.06; h expected 54.69 got 57.59
- w1100.view-home list.row[3]: y expected 489.94 got 503.95; h expected 54.69 got 57.59
- w1100.view-home list.row[4]: y expected 544.63 got 561.55; h expected 54.69 got 57.59
- w1100.view-home list.row[5]: y expected 641.61 got 661.44
- w1100.view-home list.row[6]: y expected 690.91 got 710.73
- w1100.view-home list.row[7]: y expected 740.2 got 760.03
- w1100.view-home list.row.title[0]: y expected 249.28 got 254.58; h expected 37.69 got 40.59
- w1100.view-home list.row.title[1]: y expected 303.97 got 312.17; h expected 37.69 got 40.59
- w1100.view-home list.row.title[2]: y expected 400.95 got 412.06; h expected 37.69 got 40.59
- w1100.view-home list.row.title[3]: y expected 497.94 got 511.95; h expected 37.69 got 40.59
- w1100.view-home list.row.title[4]: y expected 552.63 got 569.55; h expected 37.69 got 40.59
- w1100.view-home list.row.title[5]: y expected 655.61 got 675.44
- w1100.view-home list.row.title[6]: y expected 704.91 got 724.73
- w1100.view-home list.row.title[7]: y expected 754.2 got 774.03
- w1100.view-home list.row.note[0]: y expected 270.58 got 277.88
- w1100.view-home list.row.note[1]: y expected 325.27 got 335.47
- w1100.view-home list.row.note[2]: y expected 422.25 got 435.36
- w1100.view-home list.row.note[3]: y expected 519.23 got 535.25
- w1100.view-home list.row.note[4]: y expected 573.92 got 592.84
- w1100.view-home list.row.action[0]: y expected 251.97 got 258.72
- w1100.view-home list.row.action[1]: y expected 251.97 got 258.72
- w1100.view-home list.row.action[2]: y expected 306.66 got 316.31
- w1100.view-home list.row.action[3]: y expected 403.64 got 416.2
- w1100.view-home list.row.action[4]: y expected 403.64 got 416.2
- w1100.view-home list.row.action[5]: y expected 500.63 got 516.09
- w1100.view-home list.row.action[6]: y expected 555.31 got 573.69
- w1100.view-home list.row.action[7]: y expected 649.61 got 669.44
- w1100.view-home list.row.action[8]: y expected 649.61 got 669.44
- w1100.view-home list.row.action[9]: y expected 698.91 got 718.73
- w1100.view-home list.row.action[10]: y expected 698.91 got 718.73
- w1100.view-home list.row.action[11]: y expected 748.2 got 768.03
- w1100.view-home list.row.action[12]: y expected 748.2 got 768.03
- w1100.view-home home.composer: h expected 98.59 got 103.89
- w1100.view-home home.composer.attach: y expected 122.59 got 127.89
- w1100.view-home home.composer.project: y expected 126.89 got 132.19
- w1100.view-home home.composer.send: y expected 121.59 got 126.89
- w1100.view-home home.projectChip[0]: y expected 178.59 got 183.89
- w1100.view-home home.projectChip[1]: y expected 178.59 got 183.89
- w1100.view-home home.projectChip[2]: y expected 178.59 got 183.89
- w1100.view-home home.section[0]: y expected 213.98 got 219.28; h expected 137.67 got 143.48
- w1100.view-home home.section[1]: y expected 365.66 got 376.77; h expected 82.98 got 85.89
- w1100.view-home home.section[2]: y expected 462.64 got 476.66; h expected 137.67 got 143.48
- w1100.view-home home.section[3]: y expected 614.31 got 634.14
- w1100.view-home home.section.title[0]: y expected 213.98 got 219.28
- w1100.view-home home.section.title[1]: y expected 365.66 got 376.77
- w1100.view-home home.section.title[2]: y expected 462.64 got 476.66
- w1100.view-home home.section.title[3]: y expected 614.31 got 634.14
- w1100.view-home home.needsYou.badge: visible expected false got true
- w1100.settings settings.row[0]: h expected 54.69 got 57.59
- w1100.settings settings.row[1]: y expected 212.98 got 215.89; h expected 54.69 got 57.59
- w1100.settings settings.row[2]: y expected 267.67 got 273.48; h expected 54.69 got 57.59
- w1100.settings settings.row.title[0]: h expected 37.69 got 40.59
- w1100.settings settings.row.title[1]: y expected 220.98 got 223.89; h expected 37.69 got 40.59
- w1100.settings settings.row.title[2]: y expected 275.67 got 281.48; h expected 37.69 got 40.59
- w1100.settings settings.row.note[1]: y expected 242.28 got 247.19
- w1100.settings settings.row.note[2]: y expected 296.97 got 304.78
- w1100.settings settings.row.action[1]: y expected 223.67 got 228.03
- w1100.settings settings.row.action[2]: y expected 278.36 got 285.63
- w800.view-home page: h expected 768.5 got 788.33
- w800.view-home page.column: h expected 724.5 got 744.33
- w800.view-home list.row[0]: y expected 241.28 got 246.58; h expected 54.69 got 57.59
- w800.view-home list.row[1]: y expected 295.97 got 304.17; h expected 54.69 got 57.59
- w800.view-home list.row[2]: y expected 392.95 got 404.06; h expected 54.69 got 57.59
- w800.view-home list.row[3]: y expected 489.94 got 503.95; h expected 54.69 got 57.59
- w800.view-home list.row[4]: y expected 544.63 got 561.55; h expected 54.69 got 57.59
- w800.view-home list.row[5]: y expected 641.61 got 661.44
- w800.view-home list.row[6]: y expected 690.91 got 710.73
- w800.view-home list.row[7]: y expected 740.2 got 760.03
- w800.view-home list.row.title[0]: y expected 249.28 got 254.58; h expected 37.69 got 40.59
- w800.view-home list.row.title[1]: y expected 303.97 got 312.17; h expected 37.69 got 40.59
- w800.view-home list.row.title[2]: y expected 400.95 got 412.06; h expected 37.69 got 40.59
- w800.view-home list.row.title[3]: y expected 497.94 got 511.95; h expected 37.69 got 40.59
- w800.view-home list.row.title[4]: y expected 552.63 got 569.55; h expected 37.69 got 40.59
- w800.view-home list.row.title[5]: y expected 655.61 got 675.44
- w800.view-home list.row.title[6]: y expected 704.91 got 724.73
- w800.view-home list.row.title[7]: y expected 754.2 got 774.03
- w800.view-home list.row.note[0]: y expected 270.58 got 277.88
- w800.view-home list.row.note[1]: y expected 325.27 got 335.47
- w800.view-home list.row.note[2]: y expected 422.25 got 435.36
- w800.view-home list.row.note[3]: y expected 519.23 got 535.25
- w800.view-home list.row.note[4]: y expected 573.92 got 592.84
- w800.view-home list.row.action[0]: y expected 251.97 got 258.72
- w800.view-home list.row.action[1]: y expected 251.97 got 258.72
- w800.view-home list.row.action[2]: y expected 306.66 got 316.31
- w800.view-home list.row.action[3]: y expected 403.64 got 416.2
- w800.view-home list.row.action[4]: y expected 403.64 got 416.2
- w800.view-home list.row.action[5]: y expected 500.63 got 516.09
- w800.view-home list.row.action[6]: y expected 555.31 got 573.69
- w800.view-home list.row.action[7]: y expected 649.61 got 669.44
- w800.view-home list.row.action[8]: y expected 649.61 got 669.44
- w800.view-home list.row.action[9]: y expected 698.91 got 718.73
- w800.view-home list.row.action[10]: y expected 698.91 got 718.73
- w800.view-home list.row.action[11]: y expected 748.2 got 768.03
- w800.view-home list.row.action[12]: y expected 748.2 got 768.03
- w800.view-home home.composer: h expected 98.59 got 103.89
- w800.view-home home.composer.attach: y expected 122.59 got 127.89
- w800.view-home home.composer.project: y expected 126.89 got 132.19
- w800.view-home home.composer.send: y expected 121.59 got 126.89
- w800.view-home home.projectChip[0]: y expected 178.59 got 183.89
- w800.view-home home.projectChip[1]: y expected 178.59 got 183.89
- w800.view-home home.projectChip[2]: y expected 178.59 got 183.89
- w800.view-home home.section[0]: y expected 213.98 got 219.28; h expected 137.67 got 143.48
- w800.view-home home.section[1]: y expected 365.66 got 376.77; h expected 82.98 got 85.89
- w800.view-home home.section[2]: y expected 462.64 got 476.66; h expected 137.67 got 143.48
- w800.view-home home.section[3]: y expected 614.31 got 634.14
- w800.view-home home.section.title[0]: y expected 213.98 got 219.28
- w800.view-home home.section.title[1]: y expected 365.66 got 376.77
- w800.view-home home.section.title[2]: y expected 462.64 got 476.66
- w800.view-home home.section.title[3]: y expected 614.31 got 634.14
- w800.view-home home.needsYou.badge: y expected 214.44 got 219.73
- w800.settings settings.row[0]: h expected 54.69 got 57.59
- w800.settings settings.row[1]: y expected 212.98 got 215.89; h expected 54.69 got 57.59
- w800.settings settings.row[2]: y expected 267.67 got 273.48; h expected 54.69 got 57.59
- w800.settings settings.row.title[0]: h expected 37.69 got 40.59
- w800.settings settings.row.title[1]: y expected 220.98 got 223.89; h expected 37.69 got 40.59
- w800.settings settings.row.title[2]: y expected 275.67 got 281.48; h expected 37.69 got 40.59
- w800.settings settings.row.note[1]: y expected 242.28 got 247.19
- w800.settings settings.row.note[2]: y expected 296.97 got 304.78
- w800.settings settings.row.action[1]: y expected 223.67 got 228.03
- w800.settings settings.row.action[2]: y expected 278.36 got 285.63

## UNMAPPED rows

