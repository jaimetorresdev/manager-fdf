# Formaciones · Jugadas · Habilidades por fase

> Catálogo **generado** por `engine/app/fdf_playbook.py` a partir del DIBUJO de cada formación (sus posiciones por línea y carril) y una biblioteca de patrones inspirada en el Excel `Tacticas_FDF.xlsx`. Cada formación tiene su **propio** catálogo (máxima variabilidad). Regenerar con `engine/gen_playbook_doc.py`. Mecánica de resolución (1d40, valor de fase): `docs/MOTOR-FDF-1D40.md`.

Cada jugada es una secuencia de fases `Habilidad Posición`. Según por dónde ataques (zonas de ataque, §2.6) se usan unas jugadas u otras. El defensor de cada fase: primeras → **mediocampo**, las previas al remate → **defensa**, la última → **portero**. Finalización: **Tiro** (raso) o **Remate** (cabeza), que el portero para con **Reflejos** (juego abierto) o **Colocación** (balón parado).

## 4-4-2
*96 jugadas de campo · izquierda 32 · centro 32 · derecha 32*

**Dibujo (posiciones de campo):** Defensa: LI · DFI · DFD · LD  |  Mediocampo: MI · MCDI · MCDD · MD  |  Ataque: SD · DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×29, Tiro ×27, Remate ×16, Pase ×12, Regate ×4 · ⚽×43
- **MCDI** (Pivote izquierdo): Pase ×60, Tiro ×8, Desmarque ×7, Regate ×5, Remate ×5 · ⚽×13
- **SD** (Segundo delantero): Desmarque ×24, Tiro ×19, Pase ×15, Remate ×12, Regate ×9 · ⚽×31
- **MCDD** (Pivote derecho): Pase ×55, Desmarque ×12, Regate ×8, Tiro ×2, Remate ×1 · ⚽×3
- **MD** (Medio derecho): Pase ×20, Regate ×14, Desmarque ×6, Remate ×3, Tiro ×1 · ⚽×4
- **MI** (Medio izquierdo): Pase ×20, Regate ×14, Desmarque ×3, Remate ×2 · ⚽×2
- **DFD** (Central derecho): Pase ×14, Desmarque ×1
- **DFI** (Central izquierdo): Pase ×11, Desmarque ×2
- **LD** (Lateral derecho): Pase ×3, Desmarque ×3
- **LI** (Lateral izquierdo): Pase ×3, Desmarque ×3

### 4-4-2 · ataque por izquierda (32 jugadas)

 1. *build_central* — Pase MCDI → Pase MCDD → Desmarque DC → Pase SD → Tiro DC
 2. *build_central* — Pase MCDD → Pase MCDI → Desmarque SD → Pase DC → Tiro SD
 3. *build_paciente* — Pase MCDI → Pase MI → Pase MCDI → Desmarque DC → Tiro SD
 4. *build_paciente* — Pase MCDD → Pase MI → Pase MCDD → Desmarque SD → Tiro DC
 5. *switch_play* — Pase MCDI → Pase MD → Regate MI → Pase MD → Remate SD
 6. *switch_play* — Pase MCDD → Pase MD → Regate MI → Pase MCDD → Remate DC
 7. *wing_overlap* — Pase MCDI → Regate MI → Pase LI → Pase MI → Remate SD
 8. *wing_overlap* — Pase MCDD → Regate MI → Pase LI → Pase MI → Remate DC
 9. *wing_overlap* — Pase MCDI → Regate MI → Pase LI → Pase MI → Remate MD
10. *wing_cutback* — Pase MI → Regate MI → Desmarque MD → Pase MI → Tiro DC
11. *wing_cutback* — Pase MI → Regate MI → Desmarque MD → Pase MI → Tiro SD
12. *wing_cutback* — Pase MI → Regate MI → Desmarque MD → Pase MI → Tiro MD
13. *through_ball* — Pase DFI → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro SD
14. *through_ball* — Pase DFD → Pase MCDI → Desmarque MCDD → Desmarque SD → Tiro DC
15. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCDI → Pase DC → Tiro SD
16. *give_and_go* — Pase MCDD → Pase SD → Desmarque MCDD → Pase SD → Tiro DC
17. *counter* — Pase DFI → Regate MI → Pase MCDI → Desmarque DC → Tiro SD
18. *counter* — Pase DFD → Regate MI → Pase MCDD → Desmarque SD → Tiro DC
19. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate SD
20. *long_ball* — Pase DFD → Desmarque SD → Pase DC → Desmarque SD → Remate DC
21. *long_shot* — Pase MCDI → Regate MCDD → Tiro SD
22. *long_shot* — Pase MCDD → Regate MCDI → Tiro DC
23. *solo_run* — Regate MI → Regate MI → Regate SD → Tiro DC
24. *solo_run* — Regate MI → Regate MI → Regate SD → Tiro DC
25. *overload* — Pase MI → Desmarque LI → Pase MCDI → Desmarque DC → Remate SD
26. *overload* — Pase MI → Desmarque LI → Pase MCDD → Desmarque SD → Remate DC
27. *overload* — Pase MI → Desmarque LI → Pase MCDI → Desmarque DC → Remate MI
28. *third_man* — Pase DFD → Pase MCDI → Pase MI → Desmarque SD → Tiro DC
29. *third_man* — Pase MCDI → Pase MCDD → Pase MI → Desmarque DC → Tiro SD
30. *carrilero_run* — Pase MCDD → Desmarque MI → Pase MCDI → Remate SD
31. *carrilero_run* — Pase MCDD → Desmarque MI → Pase MCDD → Remate SD
32. *carrilero_run* — Pase MCDD → Desmarque MI → Pase MD → Remate MI

### 4-4-2 · ataque por centro (32 jugadas)

 1. *build_central* — Pase MCDD → Pase MCDI → Desmarque MCDD → Pase SD → Tiro DC
 2. *build_central* — Pase MCDI → Pase MCDD → Desmarque DC → Pase SD → Tiro MCDI
 3. *build_paciente* — Pase DFD → Pase MCDI → Pase MCDD → Desmarque SD → Tiro DC
 4. *build_paciente* — Pase MCDI → Pase MCDD → Pase MCDI → Desmarque DC → Tiro MCDI
 5. *switch_play* — Pase MCDD → Pase MCDI → Regate MCDD → Pase MCDI → Remate DC
 6. *switch_play* — Pase MCDI → Pase MCDD → Regate SD → Pase MCDD → Remate MCDI
 7. *wing_overlap* — Pase MCDD → Regate SD → Pase DFD → Pase MCDI → Remate DC
 8. *wing_overlap* — Pase MCDI → Regate DC → Pase DFI → Pase MCDD → Remate MCDI
 9. *wing_overlap* — Pase MCDD → Regate MCDI → Pase DFD → Pase SD → Remate DC
10. *wing_cutback* — Pase MCDI → Regate MCDD → Desmarque MCDI → Pase SD → Tiro DC
11. *wing_cutback* — Pase MCDD → Regate SD → Desmarque DC → Pase MCDI → Tiro MCDD
12. *wing_cutback* — Pase MCDI → Regate DC → Desmarque MCDD → Pase DC → Tiro SD
13. *through_ball* — Pase MCDD → Pase MCDI → Desmarque MCDD → Desmarque SD → Tiro DC
14. *through_ball* — Pase DFI → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro MCDI
15. *give_and_go* — Pase MCDD → Pase SD → Desmarque MCDD → Pase SD → Tiro DC
16. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCDI → Pase DC → Tiro MCDI
17. *counter* — Pase MCDD → Regate MCDI → Pase MCDD → Desmarque SD → Tiro DC
18. *counter* — Pase DFI → Regate MCDD → Pase MCDI → Desmarque DC → Tiro MCDI
19. *long_ball* — Pase DFD → Desmarque SD → Pase DC → Desmarque SD → Remate DC
20. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate MCDI
21. *long_shot* — Pase MCDD → Regate MCDI → Tiro DC
22. *long_shot* — Pase MCDI → Regate MCDD → Tiro MCDI
23. *solo_run* — Regate MCDD → Regate SD → Regate DC → Tiro SD
24. *solo_run* — Regate MCDD → Regate SD → Regate DC → Tiro MCDI
25. *overload* — Pase MCDD → Desmarque DFI → Pase MCDD → Desmarque SD → Remate DC
26. *overload* — Pase MCDI → Desmarque DFD → Pase MCDI → Desmarque DC → Remate MCDI
27. *overload* — Pase MCDD → Desmarque DFI → Pase MCDD → Desmarque SD → Remate DC
28. *third_man* — Pase DFI → Pase MCDD → Pase MCDI → Desmarque DC → Tiro SD
29. *third_man* — Pase DFD → Pase MCDI → Pase MCDD → Desmarque SD → Tiro MCDD
30. *carrilero_run* — Pase MCDI → Desmarque MCDD → Pase MCDI → Remate DC
31. *carrilero_run* — Pase MCDI → Desmarque MCDD → Pase MCDI → Remate MCDD
32. *carrilero_run* — Pase MCDI → Desmarque MCDD → Pase MCDI → Remate DC

### 4-4-2 · ataque por derecha (32 jugadas)

 1. *build_central* — Pase MCDI → Pase MCDD → Desmarque SD → Pase DC → Tiro SD
 2. *build_central* — Pase MCDD → Pase MCDI → Desmarque MCDD → Pase SD → Tiro DC
 3. *build_paciente* — Pase DFI → Pase MD → Pase MCDI → Desmarque DC → Tiro SD
 4. *build_paciente* — Pase DFD → Pase MD → Pase MCDD → Desmarque SD → Tiro DC
 5. *switch_play* — Pase MCDI → Pase MI → Regate MD → Pase MCDI → Remate SD
 6. *switch_play* — Pase MCDD → Pase MI → Regate MD → Pase MI → Remate DC
 7. *wing_overlap* — Pase MCDI → Regate MD → Pase LD → Pase MD → Remate SD
 8. *wing_overlap* — Pase MCDD → Regate MD → Pase LD → Pase MD → Remate DC
 9. *wing_overlap* — Pase MCDI → Regate MD → Pase LD → Pase MD → Remate MCDI
10. *wing_cutback* — Pase MD → Regate MD → Desmarque DC → Pase MD → Tiro DC
11. *wing_cutback* — Pase MD → Regate MD → Desmarque DC → Pase MD → Tiro SD
12. *wing_cutback* — Pase MD → Regate MD → Desmarque DC → Pase MD → Tiro MCDI
13. *through_ball* — Pase MCDI → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro SD
14. *through_ball* — Pase MCDD → Pase MCDI → Desmarque MCDD → Desmarque SD → Tiro DC
15. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCDI → Pase DC → Tiro SD
16. *give_and_go* — Pase MCDD → Pase SD → Desmarque MCDD → Pase SD → Tiro DC
17. *counter* — Pase MCDI → Regate MD → Pase MCDI → Desmarque DC → Tiro SD
18. *counter* — Pase MCDD → Regate MD → Pase MCDD → Desmarque SD → Tiro DC
19. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate SD
20. *long_ball* — Pase DFD → Desmarque SD → Pase DC → Desmarque SD → Remate DC
21. *long_shot* — Pase MCDI → Regate MCDD → Tiro SD
22. *long_shot* — Pase MCDD → Regate MCDI → Tiro DC
23. *solo_run* — Regate MD → Regate MD → Regate SD → Tiro DC
24. *solo_run* — Regate MD → Regate MD → Regate SD → Tiro DC
25. *overload* — Pase MD → Desmarque LD → Pase MCDI → Desmarque DC → Remate SD
26. *overload* — Pase MD → Desmarque LD → Pase MCDD → Desmarque SD → Remate DC
27. *overload* — Pase MD → Desmarque LD → Pase MCDI → Desmarque DC → Remate MD
28. *third_man* — Pase MCDD → Pase MCDI → Pase MD → Desmarque SD → Tiro DC
29. *third_man* — Pase DFI → Pase MCDD → Pase MD → Desmarque DC → Tiro SD
30. *carrilero_run* — Pase DFD → Desmarque MD → Pase MCDD → Remate SD
31. *carrilero_run* — Pase DFD → Desmarque MD → Pase MI → Remate SD
32. *carrilero_run* — Pase DFD → Desmarque MD → Pase MCDI → Remate MD

## 4-3-3
*99 jugadas de campo · izquierda 33 · centro 33 · derecha 33*

**Dibujo (posiciones de campo):** Defensa: LI · DFI · DFD · LD  |  Mediocampo: MI · MC · MD  |  Ataque: SDI · DC · SDD

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **MC** (Mediocentro): Pase ×93, Regate ×17, Desmarque ×14, Tiro ×8, Remate ×3 · ⚽×11
- **DC** (Delantero centro): Desmarque ×34, Pase ×18, Tiro ×13, Remate ×12, Regate ×9 · ⚽×25
- **MD** (Medio derecho): Pase ×31, Regate ×9, Desmarque ×8, Remate ×6, Tiro ×2 · ⚽×8
- **SDD** (Delantero/extremo derecho): Tiro ×20, Regate ×11, Remate ×9, Desmarque ×6, Pase ×5 · ⚽×29
- **MI** (Medio izquierdo): Pase ×28, Regate ×9, Desmarque ×7, Remate ×3, Tiro ×3 · ⚽×6
- **SDI** (Delantero/extremo izquierdo): Tiro ×14, Regate ×11, Pase ×7, Desmarque ×6, Remate ×6 · ⚽×20
- **DFI** (Central izquierdo): Pase ×14, Desmarque ×2
- **DFD** (Central derecho): Pase ×14, Desmarque ×1
- **LD** (Lateral derecho): Pase ×3, Desmarque ×3
- **LI** (Lateral izquierdo): Pase ×3, Desmarque ×3

### 4-3-3 · ataque por izquierda (33 jugadas)

 1. *build_central* — Pase MC → Pase MD → Desmarque MC → Pase DC → Tiro SDI
 2. *build_central* — Pase MC → Pase MI → Desmarque DC → Pase SDI → Tiro SDD
 3. *build_paciente* — Pase DFD → Pase MI → Pase MC → Desmarque SDI → Tiro DC
 4. *build_paciente* — Pase DFI → Pase MI → Pase MC → Desmarque SDI → Tiro SDD
 5. *switch_play* — Pase MC → Pase MD → Regate MI → Pase MD → Remate DC
 6. *switch_play* — Pase MC → Pase MD → Regate SDI → Pase MI → Remate SDI
 7. *switch_play* — Pase MC → Pase MD → Regate MI → Pase MD → Remate MI
 8. *wing_overlap* — Pase MC → Regate MI → Pase LI → Pase MI → Remate DC
 9. *wing_overlap* — Pase MC → Regate SDI → Pase LI → Pase SDI → Remate DC
10. *wing_overlap* — Pase MC → Regate MI → Pase LI → Pase MI → Remate MD
11. *wing_cutback* — Pase MI → Regate SDI → Desmarque MI → Pase SDI → Tiro DC
12. *wing_cutback* — Pase MI → Regate MI → Desmarque SDI → Pase MI → Tiro SDI
13. *wing_cutback* — Pase MI → Regate SDI → Desmarque MI → Pase SDI → Tiro MI
14. *through_ball* — Pase MC → Pase MI → Desmarque MC → Desmarque DC → Tiro SDD
15. *through_ball* — Pase DFD → Pase MC → Desmarque MI → Desmarque DC → Tiro SDI
16. *give_and_go* — Pase MC → Pase DC → Desmarque MC → Pase DC → Tiro SDD
17. *give_and_go* — Pase MC → Pase DC → Desmarque MC → Pase DC → Tiro SDI
18. *counter* — Pase DFD → Regate MI → Pase MC → Desmarque DC → Tiro SDD
19. *counter* — Pase DFI → Regate SDI → Pase MC → Desmarque DC → Tiro SDI
20. *long_ball* — Pase DFD → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
21. *long_shot* — Pase MC → Regate MC → Tiro DC
22. *long_shot* — Pase MC → Regate MC → Tiro SDI
23. *solo_run* — Regate MI → Regate SDI → Regate SDI → Tiro DC
24. *solo_run* — Regate MI → Regate SDI → Regate SDI → Tiro SDD
25. *solo_run* — Regate MI → Regate SDI → Regate SDI → Tiro MI
26. *overload* — Pase MI → Desmarque LI → Pase MC → Desmarque SDI → Remate DC
27. *overload* — Pase MI → Desmarque LI → Pase MC → Desmarque SDI → Remate SDD
28. *overload* — Pase MI → Desmarque LI → Pase MC → Desmarque SDI → Remate MI
29. *third_man* — Pase DFD → Pase MC → Pase MI → Desmarque DC → Tiro SDD
30. *third_man* — Pase DFI → Pase MC → Pase MI → Desmarque DC → Tiro SDI
31. *carrilero_run* — Pase MC → Desmarque MI → Pase MD → Remate DC
32. *carrilero_run* — Pase DFI → Desmarque MI → Pase MD → Remate SDI
33. *carrilero_run* — Pase DFD → Desmarque MI → Pase MD → Remate MI

### 4-3-3 · ataque por centro (33 jugadas)

 1. *build_central* — Pase MC → Pase MI → Desmarque DC → Pase SDI → Tiro DC
 2. *build_central* — Pase MC → Pase MD → Desmarque MC → Pase DC → Tiro MC
 3. *build_paciente* — Pase DFI → Pase MC → Pase MD → Desmarque DC → Tiro SDD
 4. *build_paciente* — Pase MC → Pase MD → Pase MC → Desmarque DC → Tiro MC
 5. *switch_play* — Pase MC → Pase MI → Regate DC → Pase MC → Remate DC
 6. *switch_play* — Pase MC → Pase MD → Regate MC → Pase MD → Remate MC
 7. *switch_play* — Pase MC → Pase MI → Regate DC → Pase MC → Remate SDD
 8. *wing_overlap* — Pase MC → Regate DC → Pase DFI → Pase DC → Remate SDI
 9. *wing_overlap* — Pase MC → Regate MC → Pase DFD → Pase MC → Remate MD
10. *wing_overlap* — Pase MC → Regate DC → Pase DFI → Pase DC → Remate SDI
11. *wing_cutback* — Pase MC → Regate MC → Desmarque DC → Pase MC → Tiro DC
12. *wing_cutback* — Pase MC → Regate DC → Desmarque MC → Pase DC → Tiro MC
13. *wing_cutback* — Pase MC → Regate MC → Desmarque DC → Pase MC → Tiro SDD
14. *through_ball* — Pase DFD → Pase MC → Desmarque MI → Desmarque DC → Tiro SDI
15. *through_ball* — Pase DFI → Pase MC → Desmarque MD → Desmarque DC → Tiro MC
16. *give_and_go* — Pase MC → Pase DC → Desmarque MC → Pase DC → Tiro SDI
17. *give_and_go* — Pase MC → Pase DC → Desmarque MC → Pase DC → Tiro MC
18. *counter* — Pase DFI → Regate DC → Pase MC → Desmarque DC → Tiro SDI
19. *counter* — Pase MC → Regate MC → Pase MD → Desmarque DC → Tiro MC
20. *long_ball* — Pase DFI → Desmarque DC → Pase SDI → Desmarque DC → Remate SDI
21. *long_shot* — Pase MC → Regate MC → Tiro DC
22. *long_shot* — Pase MC → Regate MC → Tiro MI
23. *solo_run* — Regate MC → Regate MC → Regate DC → Tiro SDI
24. *solo_run* — Regate MC → Regate MC → Regate DC → Tiro MC
25. *solo_run* — Regate MC → Regate MC → Regate DC → Tiro SDI
26. *overload* — Pase MC → Desmarque DFI → Pase MC → Desmarque DC → Remate SDD
27. *overload* — Pase MC → Desmarque DFD → Pase MC → Desmarque DC → Remate MC
28. *overload* — Pase MC → Desmarque DFI → Pase MC → Desmarque DC → Remate SDD
29. *third_man* — Pase DFI → Pase MC → Pase MI → Desmarque DC → Tiro SDI
30. *third_man* — Pase MC → Pase MI → Pase MC → Desmarque DC → Tiro MC
31. *carrilero_run* — Pase DFD → Desmarque MC → Pase MI → Remate DC
32. *carrilero_run* — Pase MC → Desmarque MD → Pase MC → Remate MD
33. *carrilero_run* — Pase DFI → Desmarque MC → Pase MI → Remate SDD

### 4-3-3 · ataque por derecha (33 jugadas)

 1. *build_central* — Pase MC → Pase MD → Desmarque MC → Pase DC → Tiro SDI
 2. *build_central* — Pase MC → Pase MI → Desmarque DC → Pase SDI → Tiro SDD
 3. *build_paciente* — Pase MC → Pase MD → Pase MC → Desmarque SDD → Tiro DC
 4. *build_paciente* — Pase DFD → Pase MD → Pase MC → Desmarque SDD → Tiro DC
 5. *switch_play* — Pase MC → Pase MI → Regate MD → Pase MC → Remate DC
 6. *switch_play* — Pase MC → Pase MI → Regate SDD → Pase MD → Remate SDD
 7. *switch_play* — Pase MC → Pase MI → Regate MD → Pase MC → Remate MD
 8. *wing_overlap* — Pase MC → Regate MD → Pase LD → Pase MD → Remate DC
 9. *wing_overlap* — Pase MC → Regate SDD → Pase LD → Pase SDD → Remate SDI
10. *wing_overlap* — Pase MC → Regate MD → Pase LD → Pase MD → Remate MC
11. *wing_cutback* — Pase MD → Regate SDD → Desmarque MD → Pase SDD → Tiro DC
12. *wing_cutback* — Pase MD → Regate MD → Desmarque SDD → Pase MD → Tiro SDD
13. *wing_cutback* — Pase MD → Regate SDD → Desmarque MD → Pase SDD → Tiro MD
14. *through_ball* — Pase DFI → Pase MC → Desmarque MD → Desmarque DC → Tiro SDD
15. *through_ball* — Pase MC → Pase MD → Desmarque MC → Desmarque DC → Tiro SDD
16. *give_and_go* — Pase MC → Pase DC → Desmarque MC → Pase DC → Tiro SDD
17. *give_and_go* — Pase MC → Pase DC → Desmarque MC → Pase DC → Tiro SDD
18. *counter* — Pase MC → Regate MD → Pase MC → Desmarque DC → Tiro SDD
19. *counter* — Pase DFD → Regate SDD → Pase MC → Desmarque DC → Tiro SDD
20. *long_ball* — Pase DFD → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
21. *long_shot* — Pase MC → Regate MC → Tiro DC
22. *long_shot* — Pase MC → Regate MC → Tiro SDD
23. *solo_run* — Regate MD → Regate SDD → Regate SDD → Tiro DC
24. *solo_run* — Regate MD → Regate SDD → Regate SDD → Tiro DC
25. *solo_run* — Regate MD → Regate SDD → Regate SDD → Tiro MD
26. *overload* — Pase MD → Desmarque LD → Pase MC → Desmarque SDD → Remate DC
27. *overload* — Pase MD → Desmarque LD → Pase MC → Desmarque SDD → Remate DC
28. *overload* — Pase MD → Desmarque LD → Pase MC → Desmarque SDD → Remate MD
29. *third_man* — Pase MC → Pase MI → Pase MD → Desmarque DC → Tiro SDD
30. *third_man* — Pase DFD → Pase MC → Pase MD → Desmarque DC → Tiro SDD
31. *carrilero_run* — Pase DFI → Desmarque MD → Pase MC → Remate DC
32. *carrilero_run* — Pase DFD → Desmarque MD → Pase MC → Remate SDD
33. *carrilero_run* — Pase MC → Desmarque MD → Pase MC → Remate MD

## 3-4-3
*99 jugadas de campo · izquierda 33 · centro 33 · derecha 33*

**Dibujo (posiciones de campo):** Defensa: DFI · DFC · DFD  |  Mediocampo: MVI · MCDI · MCDD · MVD  |  Ataque: SDI · DC · SDD

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **MCDI** (Pivote izquierdo): Pase ×65, Desmarque ×11, Regate ×6, Remate ×5, Tiro ×5 · ⚽×10
- **MCDD** (Pivote derecho): Pase ×62, Desmarque ×10, Regate ×10, Tiro ×4, Remate ×2 · ⚽×6
- **DC** (Delantero centro): Desmarque ×38, Pase ×18, Remate ×12, Tiro ×11, Regate ×7 · ⚽×23
- **SDD** (Delantero/extremo derecho): Tiro ×18, Remate ×11, Regate ×7, Pase ×6, Desmarque ×6 · ⚽×29
- **SDI** (Delantero/extremo izquierdo): Tiro ×17, Pase ×9, Regate ×7, Desmarque ×6, Remate ×6 · ⚽×23
- **MVD** (Carrilero derecho): Pase ×19, Regate ×10, Desmarque ×5, Remate ×3, Tiro ×1 · ⚽×4
- **MVI** (Carrilero izquierdo): Pase ×19, Regate ×10, Desmarque ×5, Remate ×3, Tiro ×1 · ⚽×4
- **DFC** (Central): Pase ×18, Desmarque ×3
- **DFD** (Central derecho): Pase ×3, Desmarque ×3
- **DFI** (Central izquierdo): Pase ×3, Desmarque ×3

### 3-4-3 · ataque por izquierda (33 jugadas)

 1. *build_central* — Pase MCDI → Pase MCDD → Desmarque MCDI → Pase DC → Tiro SDI
 2. *build_central* — Pase MCDD → Pase MCDI → Desmarque DC → Pase SDI → Tiro SDD
 3. *build_paciente* — Pase MCDI → Pase MVI → Pase MCDI → Desmarque SDI → Tiro DC
 4. *build_paciente* — Pase DFC → Pase MVI → Pase MCDD → Desmarque SDI → Tiro SDD
 5. *switch_play* — Pase MCDI → Pase MVD → Regate MVI → Pase MVD → Remate DC
 6. *switch_play* — Pase MCDD → Pase MVD → Regate SDI → Pase MVI → Remate SDI
 7. *switch_play* — Pase MCDI → Pase MVD → Regate MVI → Pase MCDI → Remate MVI
 8. *wing_overlap* — Pase MCDD → Regate MVI → Pase DFI → Pase MVI → Remate DC
 9. *wing_overlap* — Pase MCDI → Regate SDI → Pase DFI → Pase SDI → Remate DC
10. *wing_overlap* — Pase MCDD → Regate MVI → Pase DFI → Pase MVI → Remate MCDD
11. *wing_cutback* — Pase MVI → Regate SDI → Desmarque MVI → Pase SDI → Tiro DC
12. *wing_cutback* — Pase MVI → Regate MVI → Desmarque SDI → Pase MVI → Tiro SDI
13. *wing_cutback* — Pase MVI → Regate SDI → Desmarque MVI → Pase SDI → Tiro MVI
14. *through_ball* — Pase MCDD → Pase MCDI → Desmarque MCDD → Desmarque DC → Tiro SDD
15. *through_ball* — Pase MCDI → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro SDI
16. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCDD → Pase DC → Tiro SDD
17. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCDI → Pase DC → Tiro SDI
18. *counter* — Pase MCDI → Regate MVI → Pase MCDD → Desmarque DC → Tiro SDD
19. *counter* — Pase DFC → Regate SDI → Pase MCDI → Desmarque DC → Tiro SDI
20. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
21. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate SDI
22. *long_shot* — Pase MCDD → Regate MCDI → Tiro DC
23. *long_shot* — Pase MCDI → Regate MCDD → Tiro SDI
24. *solo_run* — Regate MVI → Regate MVI → Regate SDI → Tiro DC
25. *solo_run* — Regate MVI → Regate MVI → Regate SDI → Tiro DC
26. *overload* — Pase MVI → Desmarque DFI → Pase MCDD → Desmarque SDI → Remate DC
27. *overload* — Pase MVI → Desmarque DFI → Pase MCDI → Desmarque SDI → Remate DC
28. *overload* — Pase MVI → Desmarque DFI → Pase MCDD → Desmarque SDI → Remate MVI
29. *third_man* — Pase MCDD → Pase MCDI → Pase MVI → Desmarque DC → Tiro SDI
30. *third_man* — Pase MCDI → Pase MCDD → Pase MVI → Desmarque DC → Tiro SDI
31. *carrilero_run* — Pase DFC → Desmarque MVI → Pase MVD → Remate DC
32. *carrilero_run* — Pase MCDI → Desmarque MVI → Pase MCDI → Remate SDI
33. *carrilero_run* — Pase MCDD → Desmarque MVI → Pase MCDD → Remate MVI

### 3-4-3 · ataque por centro (33 jugadas)

 1. *build_central* — Pase MCDI → Pase MCDD → Desmarque MCDI → Pase DC → Tiro SDI
 2. *build_central* — Pase MCDD → Pase MCDI → Desmarque DC → Pase SDI → Tiro MCDD
 3. *build_paciente* — Pase MCDI → Pase MCDD → Pase MCDI → Desmarque DC → Tiro SDI
 4. *build_paciente* — Pase DFC → Pase MCDI → Pase MCDD → Desmarque DC → Tiro MCDD
 5. *switch_play* — Pase MCDI → Pase MCDD → Regate MCDD → Pase MCDI → Remate DC
 6. *switch_play* — Pase MCDD → Pase MCDI → Regate MCDI → Pase MCDD → Remate MCDI
 7. *switch_play* — Pase MCDI → Pase MCDD → Regate DC → Pase MCDD → Remate SDI
 8. *wing_overlap* — Pase MCDD → Regate MCDI → Pase DFC → Pase DC → Remate SDD
 9. *wing_overlap* — Pase MCDI → Regate DC → Pase DFC → Pase MCDD → Remate MCDI
10. *wing_overlap* — Pase MCDD → Regate MCDD → Pase DFC → Pase MCDI → Remate SDD
11. *wing_cutback* — Pase MCDI → Regate MCDI → Desmarque MCDD → Pase DC → Tiro SDI
12. *wing_cutback* — Pase MCDD → Regate DC → Desmarque MCDD → Pase MCDI → Tiro MCDD
13. *wing_cutback* — Pase MCDI → Regate MCDD → Desmarque MCDI → Pase DC → Tiro SDI
14. *through_ball* — Pase MCDD → Pase MCDI → Desmarque MCDD → Desmarque DC → Tiro SDD
15. *through_ball* — Pase MCDI → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro MCDI
16. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCDD → Pase DC → Tiro SDD
17. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCDI → Pase DC → Tiro MCDI
18. *counter* — Pase MCDI → Regate DC → Pase MCDD → Desmarque DC → Tiro SDD
19. *counter* — Pase DFC → Regate MCDD → Pase MCDI → Desmarque DC → Tiro MCDI
20. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
21. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate MCDI
22. *long_shot* — Pase MCDD → Regate MCDI → Tiro DC
23. *long_shot* — Pase MCDI → Regate MCDD → Tiro MCDI
24. *solo_run* — Regate MCDD → Regate MCDD → Regate DC → Tiro SDI
25. *solo_run* — Regate MCDD → Regate DC → Regate DC → Tiro MCDI
26. *overload* — Pase MCDD → Desmarque DFC → Pase MCDD → Desmarque DC → Remate SDD
27. *overload* — Pase MCDI → Desmarque DFC → Pase MCDI → Desmarque DC → Remate MCDI
28. *overload* — Pase MCDD → Desmarque DFC → Pase MCDD → Desmarque DC → Remate SDD
29. *third_man* — Pase MCDD → Pase MCDI → Pase MCDD → Desmarque DC → Tiro SDI
30. *third_man* — Pase MCDI → Pase MCDD → Pase MCDI → Desmarque DC → Tiro MCDD
31. *carrilero_run* — Pase DFC → Desmarque MCDD → Pase MCDI → Remate DC
32. *carrilero_run* — Pase MCDI → Desmarque MCDD → Pase MCDI → Remate MCDD
33. *carrilero_run* — Pase MCDD → Desmarque MCDI → Pase MCDD → Remate SDD

### 3-4-3 · ataque por derecha (33 jugadas)

 1. *build_central* — Pase MCDI → Pase MCDD → Desmarque MCDI → Pase DC → Tiro SDI
 2. *build_central* — Pase MCDD → Pase MCDI → Desmarque DC → Pase SDI → Tiro SDD
 3. *build_paciente* — Pase MCDI → Pase MVD → Pase MCDI → Desmarque SDD → Tiro DC
 4. *build_paciente* — Pase DFC → Pase MVD → Pase MCDD → Desmarque SDD → Tiro DC
 5. *switch_play* — Pase MCDI → Pase MVI → Regate MVD → Pase MCDD → Remate DC
 6. *switch_play* — Pase MCDD → Pase MVI → Regate SDD → Pase MVD → Remate SDD
 7. *switch_play* — Pase MCDI → Pase MVI → Regate MVD → Pase MVI → Remate MVD
 8. *wing_overlap* — Pase MCDD → Regate MVD → Pase DFD → Pase MVD → Remate DC
 9. *wing_overlap* — Pase MCDI → Regate SDD → Pase DFD → Pase SDD → Remate SDI
10. *wing_overlap* — Pase MCDD → Regate MVD → Pase DFD → Pase MVD → Remate MCDI
11. *wing_cutback* — Pase MVD → Regate SDD → Desmarque MVD → Pase SDD → Tiro DC
12. *wing_cutback* — Pase MVD → Regate MVD → Desmarque SDD → Pase MVD → Tiro SDD
13. *wing_cutback* — Pase MVD → Regate SDD → Desmarque MVD → Pase SDD → Tiro MVD
14. *through_ball* — Pase MCDD → Pase MCDI → Desmarque MCDD → Desmarque DC → Tiro SDD
15. *through_ball* — Pase MCDI → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro SDD
16. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCDD → Pase DC → Tiro SDD
17. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCDI → Pase DC → Tiro SDD
18. *counter* — Pase MCDI → Regate MVD → Pase MCDD → Desmarque DC → Tiro SDD
19. *counter* — Pase DFC → Regate SDD → Pase MCDI → Desmarque DC → Tiro SDD
20. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
21. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate SDD
22. *long_shot* — Pase MCDD → Regate MCDI → Tiro DC
23. *long_shot* — Pase MCDI → Regate MCDD → Tiro SDD
24. *solo_run* — Regate MVD → Regate MVD → Regate SDD → Tiro DC
25. *solo_run* — Regate MVD → Regate MVD → Regate SDD → Tiro SDI
26. *overload* — Pase MVD → Desmarque DFD → Pase MCDD → Desmarque SDD → Remate DC
27. *overload* — Pase MVD → Desmarque DFD → Pase MCDI → Desmarque SDD → Remate SDI
28. *overload* — Pase MVD → Desmarque DFD → Pase MCDD → Desmarque SDD → Remate MVD
29. *third_man* — Pase MCDD → Pase MCDI → Pase MVD → Desmarque DC → Tiro SDI
30. *third_man* — Pase MCDI → Pase MCDD → Pase MVD → Desmarque DC → Tiro SDD
31. *carrilero_run* — Pase DFC → Desmarque MVD → Pase MCDD → Remate DC
32. *carrilero_run* — Pase MCDI → Desmarque MVD → Pase MVI → Remate SDD
33. *carrilero_run* — Pase MCDD → Desmarque MVD → Pase MCDI → Remate MVD

## 4-2-3-1
*108 jugadas de campo · izquierda 36 · centro 36 · derecha 36*

**Dibujo (posiciones de campo):** Defensa: LI · DFI · DFD · LD  |  Mediocampo: MCDI · MCDD · MI · MCO · MD  |  Ataque: DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×58, Tiro ×52, Pase ×35, Remate ×26, Regate ×9 · ⚽×78
- **MCO** (Mediapunta): Pase ×43, Desmarque ×13, Regate ×7, Tiro ×4, Remate ×3 · ⚽×7
- **MCDI** (Pivote izquierdo): Pase ×50, Regate ×9, Desmarque ×7, Tiro ×2 · ⚽×2
- **MCDD** (Pivote derecho): Pase ×40, Desmarque ×9, Regate ×4, Tiro ×3, Remate ×2 · ⚽×5
- **MI** (Medio izquierdo): Pase ×18, Regate ×14, Tiro ×7, Desmarque ×4, Remate ×1 · ⚽×8
- **MD** (Medio derecho): Pase ×18, Regate ×14, Tiro ×7, Desmarque ×2, Remate ×1 · ⚽×8
- **DFI** (Central izquierdo): Pase ×31, Desmarque ×1
- **DFD** (Central derecho): Pase ×7, Desmarque ×1
- **LD** (Lateral derecho): Pase ×2, Desmarque ×2
- **LI** (Lateral izquierdo): Pase ×2, Desmarque ×2

### 4-2-3-1 · ataque por izquierda (36 jugadas)

 1. *build_central* — Pase MCDI → Pase MCO → Desmarque DC → Pase DC → Tiro DC
 2. *build_central* — Pase MCO → Pase MCDI → Desmarque MCO → Pase DC → Tiro DC
 3. *build_central* — Pase MCDD → Pase MCO → Desmarque MCDI → Pase DC → Tiro MI
 4. *build_paciente* — Pase DFI → Pase MI → Pase MCO → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase DFI → Pase MI → Pase MCDD → Desmarque DC → Tiro DC
 6. *build_paciente* — Pase DFI → Pase MI → Pase MCDI → Desmarque DC → Tiro MI
 7. *switch_play* — Pase MCDI → Pase MD → Regate MI → Pase MCDD → Remate DC
 8. *switch_play* — Pase MCO → Pase MD → Regate MI → Pase MCO → Remate DC
 9. *switch_play* — Pase MCDD → Pase MD → Regate MI → Pase MD → Remate MI
10. *wing_overlap* — Pase MCDI → Regate MI → Pase LI → Pase MI → Remate DC
11. *wing_overlap* — Pase MCO → Regate MI → Pase LI → Pase MI → Remate DC
12. *wing_cutback* — Pase MI → Regate MI → Desmarque MCO → Pase MI → Tiro DC
13. *wing_cutback* — Pase MI → Regate MI → Desmarque MCO → Pase MI → Tiro DC
14. *through_ball* — Pase DFI → Pase MCDI → Desmarque MCO → Desmarque DC → Tiro DC
15. *through_ball* — Pase DFI → Pase MCO → Desmarque MCDI → Desmarque DC → Tiro DC
16. *through_ball* — Pase DFI → Pase MCDD → Desmarque MCO → Desmarque DC → Tiro MI
17. *give_and_go* — Pase MCO → Pase DC → Desmarque MCDD → Pase DC → Tiro DC
18. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCDI → Pase DC → Tiro DC
19. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCO → Pase DC → Tiro MI
20. *counter* — Pase DFI → Regate MI → Pase MCDD → Desmarque DC → Tiro DC
21. *counter* — Pase DFI → Regate MI → Pase MCDI → Desmarque DC → Tiro DC
22. *counter* — Pase DFI → Regate MI → Pase MCO → Desmarque DC → Tiro MI
23. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
24. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate DC
25. *long_shot* — Pase MCDI → Regate MCDD → Tiro DC
26. *long_shot* — Pase MCDI → Regate MCDD → Tiro DC
27. *long_shot* — Pase MCDI → Regate MCDD → Tiro MI
28. *solo_run* — Regate MI → Regate MI → Regate DC → Tiro DC
29. *solo_run* — Regate MI → Regate MI → Regate DC → Tiro DC
30. *overload* — Pase MI → Desmarque LI → Pase MCDD → Desmarque DC → Remate DC
31. *overload* — Pase MI → Desmarque LI → Pase MCDI → Desmarque DC → Remate DC
32. *third_man* — Pase MCDI → Pase MCDD → Pase MI → Desmarque DC → Tiro DC
33. *third_man* — Pase MCDI → Pase MCO → Pase MI → Desmarque DC → Tiro DC
34. *third_man* — Pase MCDI → Pase MCDD → Pase MI → Desmarque DC → Tiro MI
35. *carrilero_run* — Pase MCDI → Desmarque MI → Pase MCDI → Remate DC
36. *carrilero_run* — Pase DFD → Desmarque MI → Pase MCDI → Remate DC

### 4-2-3-1 · ataque por centro (36 jugadas)

 1. *build_central* — Pase MCO → Pase MCDD → Desmarque MCO → Pase DC → Tiro DC
 2. *build_central* — Pase MCDD → Pase MCDI → Desmarque MCDD → Pase DC → Tiro MCO
 3. *build_central* — Pase MCDI → Pase MCO → Desmarque DC → Pase DC → Tiro DC
 4. *build_paciente* — Pase DFI → Pase MCDI → Pase MCO → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase DFI → Pase MCO → Pase MCDI → Desmarque DC → Tiro MCO
 6. *build_paciente* — Pase DFI → Pase MCDD → Pase MCO → Desmarque DC → Tiro DC
 7. *switch_play* — Pase MCO → Pase MCDD → Regate MCO → Pase MCDD → Remate DC
 8. *switch_play* — Pase MCDD → Pase MCDI → Regate DC → Pase MCDD → Remate MCO
 9. *switch_play* — Pase MCDI → Pase MCO → Regate MCDI → Pase MCO → Remate DC
10. *wing_overlap* — Pase MCO → Regate MCDI → Pase DFD → Pase MCO → Remate DC
11. *wing_overlap* — Pase MCDD → Regate MCDD → Pase DFI → Pase DC → Remate MCO
12. *wing_cutback* — Pase MCDI → Regate MCO → Desmarque DC → Pase MCDI → Tiro DC
13. *wing_cutback* — Pase MCO → Regate DC → Desmarque MCDD → Pase DC → Tiro MCDI
14. *through_ball* — Pase DFI → Pase MCO → Desmarque MCDD → Desmarque DC → Tiro DC
15. *through_ball* — Pase DFI → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro MCDD
16. *through_ball* — Pase DFI → Pase MCDI → Desmarque MCO → Desmarque DC → Tiro DC
17. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCDI → Pase DC → Tiro DC
18. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCO → Pase DC → Tiro MCDD
19. *give_and_go* — Pase MCO → Pase DC → Desmarque MCDD → Pase DC → Tiro DC
20. *counter* — Pase DFI → Regate MCO → Pase MCDD → Desmarque DC → Tiro DC
21. *counter* — Pase DFI → Regate DC → Pase MCO → Desmarque DC → Tiro MCDD
22. *counter* — Pase DFI → Regate MCDI → Pase MCO → Desmarque DC → Tiro DC
23. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
24. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate MCDD
25. *long_shot* — Pase MCO → Regate MCDI → Tiro DC
26. *long_shot* — Pase MCO → Regate MCDI → Tiro MCO
27. *long_shot* — Pase MCO → Regate MCDI → Tiro DC
28. *solo_run* — Regate MCO → Regate MCDI → Regate DC → Tiro DC
29. *solo_run* — Regate MCDI → Regate MCDI → Regate DC → Tiro MCDI
30. *overload* — Pase MCDD → Desmarque DFI → Pase MCDI → Desmarque DC → Remate DC
31. *overload* — Pase MCDI → Desmarque DFD → Pase MCO → Desmarque DC → Remate MCDD
32. *third_man* — Pase MCDI → Pase MCDD → Pase MCO → Desmarque DC → Tiro DC
33. *third_man* — Pase MCDI → Pase MCO → Pase MCDI → Desmarque DC → Tiro MCO
34. *third_man* — Pase MCDI → Pase MCDD → Pase MCO → Desmarque DC → Tiro DC
35. *carrilero_run* — Pase MCDI → Desmarque MCO → Pase MCDI → Remate DC
36. *carrilero_run* — Pase DFD → Desmarque MCDD → Pase MCDI → Remate MCO

### 4-2-3-1 · ataque por derecha (36 jugadas)

 1. *build_central* — Pase MCDD → Pase MCO → Desmarque MCDI → Pase DC → Tiro DC
 2. *build_central* — Pase MCDI → Pase MCDD → Desmarque DC → Pase DC → Tiro DC
 3. *build_central* — Pase MCO → Pase MCDD → Desmarque MCO → Pase DC → Tiro MD
 4. *build_paciente* — Pase DFI → Pase MD → Pase MCDI → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase DFI → Pase MD → Pase MCO → Desmarque DC → Tiro DC
 6. *build_paciente* — Pase DFI → Pase MD → Pase MCDD → Desmarque DC → Tiro MD
 7. *switch_play* — Pase MCDD → Pase MI → Regate MD → Pase MCDD → Remate DC
 8. *switch_play* — Pase MCDI → Pase MI → Regate MD → Pase MI → Remate DC
 9. *switch_play* — Pase MCO → Pase MI → Regate MD → Pase MCO → Remate MD
10. *wing_overlap* — Pase MCDD → Regate MD → Pase LD → Pase MD → Remate DC
11. *wing_overlap* — Pase MCDI → Regate MD → Pase LD → Pase MD → Remate DC
12. *wing_cutback* — Pase MD → Regate MD → Desmarque MI → Pase MD → Tiro DC
13. *wing_cutback* — Pase MD → Regate MD → Desmarque MI → Pase MD → Tiro DC
14. *through_ball* — Pase DFI → Pase MCDD → Desmarque MCO → Desmarque DC → Tiro DC
15. *through_ball* — Pase DFI → Pase MCDI → Desmarque MCDD → Desmarque DC → Tiro DC
16. *through_ball* — Pase DFI → Pase MCO → Desmarque MCDD → Desmarque DC → Tiro MD
17. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCO → Pase DC → Tiro DC
18. *give_and_go* — Pase MCO → Pase DC → Desmarque MCDD → Pase DC → Tiro DC
19. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCDI → Pase DC → Tiro MD
20. *counter* — Pase DFI → Regate MD → Pase MCO → Desmarque DC → Tiro DC
21. *counter* — Pase DFI → Regate MD → Pase MCDD → Desmarque DC → Tiro DC
22. *counter* — Pase DFI → Regate MD → Pase MCDI → Desmarque DC → Tiro MD
23. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
24. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate DC
25. *long_shot* — Pase MCDD → Regate MCO → Tiro DC
26. *long_shot* — Pase MCDD → Regate MCO → Tiro DC
27. *long_shot* — Pase MCDD → Regate MCO → Tiro MD
28. *solo_run* — Regate MD → Regate MD → Regate DC → Tiro DC
29. *solo_run* — Regate MD → Regate MD → Regate DC → Tiro DC
30. *overload* — Pase MD → Desmarque LD → Pase MCO → Desmarque DC → Remate DC
31. *overload* — Pase MD → Desmarque LD → Pase MCDD → Desmarque DC → Remate DC
32. *third_man* — Pase MCDI → Pase MCDD → Pase MD → Desmarque DC → Tiro DC
33. *third_man* — Pase MCDI → Pase MCO → Pase MD → Desmarque DC → Tiro DC
34. *third_man* — Pase MCDI → Pase MCDD → Pase MD → Desmarque DC → Tiro MD
35. *carrilero_run* — Pase MCDI → Desmarque MD → Pase MCDI → Remate DC
36. *carrilero_run* — Pase DFD → Desmarque MD → Pase MCDI → Remate DC

## 4-4-1-1
*105 jugadas de campo · izquierda 35 · centro 35 · derecha 35*

**Dibujo (posiciones de campo):** Defensa: LI · DFI · DFD · LD  |  Mediocampo: MCD · MCD2 · MCD3 · MCD4 · MCO  |  Ataque: DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×59, Tiro ×51, Pase ×35, Remate ×26, Regate ×13 · ⚽×77
- **MCO** (Mediapunta): Pase ×41, Regate ×8, Desmarque ×7, Tiro ×6 · ⚽×6
- **MCD** (Pivote): Pase ×43, Regate ×10, Desmarque ×3, Tiro ×3, Remate ×2 · ⚽×5
- **MCD3** (Pivote): Pase ×40, Desmarque ×11, Regate ×6, Remate ×1, Tiro ×1 · ⚽×2
- **MCD4** (Pivote): Pase ×33, Regate ×8, Desmarque ×6, Tiro ×6, Remate ×2 · ⚽×8
- **MCD2** (Pivote): Pase ×26, Regate ×9, Desmarque ×7, Tiro ×5, Remate ×2 · ⚽×7
- **DFI** (Central izquierdo): Pase ×12, Desmarque ×1
- **DFD** (Central derecho): Pase ×9, Desmarque ×1
- **LD** (Lateral derecho): Pase ×2, Desmarque ×2
- **LI** (Lateral izquierdo): Pase ×2, Desmarque ×2

### 4-4-1-1 · ataque por izquierda (35 jugadas)

 1. *build_central* — Pase MCD → Pase MCD3 → Desmarque MCD4 → Pase DC → Tiro DC
 2. *build_central* — Pase MCD → Pase MCD4 → Desmarque MCD3 → Pase DC → Tiro DC
 3. *build_central* — Pase MCD → Pase MCO → Desmarque MCD3 → Pase DC → Tiro MCO
 4. *build_paciente* — Pase DFD → Pase MCD2 → Pase MCD3 → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase MCO → Pase MCD2 → Pase MCD4 → Desmarque DC → Tiro DC
 6. *build_paciente* — Pase MCD3 → Pase MCD4 → Pase MCO → Desmarque DC → Tiro MCO
 7. *switch_play* — Pase MCD → Pase MCO → Regate MCD3 → Pase MCD2 → Remate DC
 8. *switch_play* — Pase MCD → Pase MCD2 → Regate MCD2 → Pase MCD4 → Remate DC
 9. *switch_play* — Pase MCD → Pase MCD3 → Regate MCD → Pase MCO → Remate MCD
10. *wing_overlap* — Pase MCD → Regate MCO → Pase LI → Pase MCD → Remate DC
11. *wing_overlap* — Pase MCD → Regate MCD4 → Pase LI → Pase DC → Remate DC
12. *wing_cutback* — Pase MCD → Regate MCD3 → Desmarque MCD4 → Pase MCO → Tiro DC
13. *wing_cutback* — Pase MCD → Regate MCD2 → Desmarque MCD4 → Pase MCO → Tiro DC
14. *through_ball* — Pase MCD → Pase MCD4 → Desmarque MCO → Desmarque DC → Tiro DC
15. *through_ball* — Pase DFI → Pase MCD2 → Desmarque MCD → Desmarque DC → Tiro DC
16. *through_ball* — Pase MCD4 → Pase MCD → Desmarque MCD3 → Desmarque DC → Tiro MCO
17. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD3 → Pase DC → Tiro DC
18. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD3 → Pase DC → Tiro DC
19. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD3 → Pase DC → Tiro MCO
20. *counter* — Pase MCD3 → Regate MCD → Pase MCD3 → Desmarque DC → Tiro DC
21. *counter* — Pase MCD → Regate DC → Pase MCD3 → Desmarque DC → Tiro DC
22. *counter* — Pase DFI → Regate MCO → Pase MCD4 → Desmarque DC → Tiro MCO
23. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
24. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate DC
25. *long_shot* — Pase MCD → Regate MCD2 → Tiro DC
26. *long_shot* — Pase MCD4 → Regate MCO → Tiro DC
27. *solo_run* — Regate MCD2 → Regate MCD2 → Regate DC → Tiro DC
28. *solo_run* — Regate MCD → Regate DC → Regate DC → Tiro DC
29. *overload* — Pase MCO → Desmarque LI → Pase MCD2 → Desmarque DC → Remate DC
30. *overload* — Pase MCO → Desmarque LI → Pase MCD2 → Desmarque DC → Remate DC
31. *third_man* — Pase MCD3 → Pase MCD2 → Pase MCD4 → Desmarque DC → Tiro DC
32. *third_man* — Pase MCD → Pase MCD4 → Pase MCO → Desmarque DC → Tiro DC
33. *third_man* — Pase DFI → Pase MCD → Pase MCD2 → Desmarque DC → Tiro MCD4
34. *carrilero_run* — Pase MCD4 → Desmarque MCD → Pase MCD3 → Remate DC
35. *carrilero_run* — Pase MCD → Desmarque MCD2 → Pase MCD3 → Remate DC

### 4-4-1-1 · ataque por centro (35 jugadas)

 1. *build_central* — Pase MCD3 → Pase MCD → Desmarque DC → Pase DC → Tiro DC
 2. *build_central* — Pase MCD3 → Pase MCD2 → Desmarque DC → Pase DC → Tiro MCD2
 3. *build_central* — Pase MCD3 → Pase MCD4 → Desmarque DC → Pase DC → Tiro DC
 4. *build_paciente* — Pase DFI → Pase MCD4 → Pase MCD → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase MCD4 → Pase MCD → Pase MCD3 → Desmarque DC → Tiro MCD2
 6. *build_paciente* — Pase MCD2 → Pase MCD3 → Pase MCD4 → Desmarque DC → Tiro DC
 7. *switch_play* — Pase MCD3 → Pase MCD4 → Regate MCD2 → Pase MCD → Remate DC
 8. *switch_play* — Pase MCD3 → Pase MCO → Regate MCD → Pase MCD3 → Remate MCD4
 9. *switch_play* — Pase MCD3 → Pase MCD → Regate DC → Pase MCD → Remate DC
10. *wing_overlap* — Pase MCD3 → Regate MCD4 → Pase DFI → Pase DC → Remate DC
11. *wing_overlap* — Pase MCD3 → Regate MCD3 → Pase DFD → Pase MCO → Remate MCD2
12. *wing_cutback* — Pase MCD3 → Regate MCD2 → Desmarque DC → Pase MCD → Tiro DC
13. *wing_cutback* — Pase MCD3 → Regate MCD → Desmarque DC → Pase MCD → Tiro MCO
14. *through_ball* — Pase DFD → Pase MCD4 → Desmarque MCD3 → Desmarque DC → Tiro DC
15. *through_ball* — Pase MCO → Pase MCD3 → Desmarque MCO → Desmarque DC → Tiro MCD2
16. *through_ball* — Pase MCD3 → Pase MCO → Desmarque MCD → Desmarque DC → Tiro DC
17. *give_and_go* — Pase MCD3 → Pase DC → Desmarque MCO → Pase DC → Tiro DC
18. *give_and_go* — Pase MCD3 → Pase DC → Desmarque MCO → Pase DC → Tiro MCD2
19. *give_and_go* — Pase MCD3 → Pase DC → Desmarque MCO → Pase DC → Tiro DC
20. *counter* — Pase MCD2 → Regate DC → Pase MCO → Desmarque DC → Tiro DC
21. *counter* — Pase DFD → Regate MCO → Pase MCD2 → Desmarque DC → Tiro MCD2
22. *counter* — Pase MCO → Regate MCD4 → Pase MCD3 → Desmarque DC → Tiro DC
23. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate DC
24. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate MCD2
25. *long_shot* — Pase MCD3 → Regate MCD4 → Tiro DC
26. *long_shot* — Pase MCD → Regate MCD2 → Tiro MCD
27. *solo_run* — Regate MCD4 → Regate MCD → Regate DC → Tiro DC
28. *solo_run* — Regate MCD3 → Regate MCO → Regate DC → Tiro MCD
29. *overload* — Pase MCD2 → Desmarque DFI → Pase MCD4 → Desmarque DC → Remate DC
30. *overload* — Pase MCD2 → Desmarque DFD → Pase MCD4 → Desmarque DC → Remate MCD
31. *third_man* — Pase MCD2 → Pase MCD → Pase MCD3 → Desmarque DC → Tiro DC
32. *third_man* — Pase DFD → Pase MCD3 → Pase MCD4 → Desmarque DC → Tiro MCD
33. *third_man* — Pase MCO → Pase MCD3 → Pase MCO → Desmarque DC → Tiro DC
34. *carrilero_run* — Pase MCD3 → Desmarque MCO → Pase MCD → Remate DC
35. *carrilero_run* — Pase DFD → Desmarque MCD2 → Pase MCD → Remate MCD3

### 4-4-1-1 · ataque por derecha (35 jugadas)

 1. *build_central* — Pase MCO → Pase MCD4 → Desmarque MCD2 → Pase DC → Tiro DC
 2. *build_central* — Pase MCO → Pase MCD → Desmarque MCD3 → Pase DC → Tiro DC
 3. *build_central* — Pase MCO → Pase MCD2 → Desmarque MCD3 → Pase DC → Tiro MCD4
 4. *build_paciente* — Pase MCO → Pase MCD3 → Pase MCO → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase MCD3 → Pase MCO → Pase MCD → Desmarque DC → Tiro DC
 6. *build_paciente* — Pase MCD → Pase MCD2 → Pase MCD3 → Desmarque DC → Tiro MCD4
 7. *switch_play* — Pase MCO → Pase MCD2 → Regate MCD → Pase MCO → Remate DC
 8. *switch_play* — Pase MCO → Pase MCD3 → Regate DC → Pase MCD3 → Remate DC
 9. *switch_play* — Pase MCO → Pase MCD4 → Regate MCO → Pase MCD2 → Remate MCD4
10. *wing_overlap* — Pase MCO → Regate MCD3 → Pase LD → Pase MCO → Remate DC
11. *wing_overlap* — Pase MCO → Regate MCD2 → Pase LD → Pase MCD4 → Remate DC
12. *wing_cutback* — Pase MCO → Regate MCD → Desmarque MCD3 → Pase MCD4 → Tiro DC
13. *wing_cutback* — Pase MCO → Regate DC → Desmarque MCD2 → Pase MCD4 → Tiro DC
14. *through_ball* — Pase DFI → Pase MCD → Desmarque MCD3 → Desmarque DC → Tiro DC
15. *through_ball* — Pase MCD4 → Pase MCD2 → Desmarque MCD4 → Desmarque DC → Tiro DC
16. *through_ball* — Pase MCD2 → Pase MCD4 → Desmarque MCO → Desmarque DC → Tiro MCD4
17. *give_and_go* — Pase MCO → Pase DC → Desmarque MCD2 → Pase DC → Tiro DC
18. *give_and_go* — Pase MCO → Pase DC → Desmarque MCD2 → Pase DC → Tiro DC
19. *give_and_go* — Pase MCO → Pase DC → Desmarque MCD2 → Pase DC → Tiro MCD4
20. *counter* — Pase MCD → Regate MCO → Pase MCD4 → Desmarque DC → Tiro DC
21. *counter* — Pase DFI → Regate MCD4 → Pase MCD → Desmarque DC → Tiro DC
22. *counter* — Pase MCD4 → Regate MCD3 → Pase MCD2 → Desmarque DC → Tiro MCD4
23. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
24. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate DC
25. *long_shot* — Pase MCO → Regate MCD → Tiro DC
26. *long_shot* — Pase MCD3 → Regate MCD4 → Tiro DC
27. *solo_run* — Regate MCD → Regate DC → Regate DC → Tiro DC
28. *solo_run* — Regate MCO → Regate MCD4 → Regate DC → Tiro DC
29. *overload* — Pase MCD4 → Desmarque LD → Pase MCD → Desmarque DC → Remate DC
30. *overload* — Pase MCD4 → Desmarque LD → Pase MCD → Desmarque DC → Remate DC
31. *third_man* — Pase MCD → Pase MCO → Pase MCD → Desmarque DC → Tiro DC
32. *third_man* — Pase DFI → Pase MCO → Pase MCD2 → Desmarque DC → Tiro DC
33. *third_man* — Pase MCD4 → Pase MCD2 → Pase MCD4 → Desmarque DC → Tiro MCD3
34. *carrilero_run* — Pase MCD2 → Desmarque MCD4 → Pase MCO → Remate DC
35. *carrilero_run* — Pase DFI → Desmarque MCD4 → Pase MCO → Remate DC

## 4-3-2-1
*102 jugadas de campo · izquierda 34 · centro 34 · derecha 34*

**Dibujo (posiciones de campo):** Defensa: LI · DFI · DFD · LD  |  Mediocampo: MCDI · MCD · MCDD · MCO · SD  |  Ataque: DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×54, Tiro ×51, Pase ×35, Remate ×25, Regate ×8 · ⚽×76
- **MCD** (Pivote): Pase ×46, Desmarque ×9, Regate ×9, Tiro ×2 · ⚽×2
- **MCO** (Mediapunta): Pase ×41, Desmarque ×11, Tiro ×6, Regate ×6 · ⚽×6
- **SD** (Segundo delantero): Pase ×37, Desmarque ×12, Remate ×5, Regate ×4, Tiro ×1 · ⚽×6
- **MCDD** (Pivote derecho): Pase ×17, Regate ×12, Tiro ×6, Desmarque ×2 · ⚽×6
- **MCDI** (Pivote izquierdo): Pase ×16, Regate ×12, Tiro ×6, Desmarque ×2 · ⚽×6
- **DFI** (Central izquierdo): Pase ×28, Desmarque ×1
- **DFD** (Central derecho): Pase ×7, Desmarque ×1
- **LD** (Lateral derecho): Pase ×2, Desmarque ×2
- **LI** (Lateral izquierdo): Pase ×2, Desmarque ×2

### 4-3-2-1 · ataque por izquierda (34 jugadas)

 1. *build_central* — Pase MCD → Pase SD → Desmarque DC → Pase DC → Tiro DC
 2. *build_central* — Pase SD → Pase MCD → Desmarque SD → Pase DC → Tiro DC
 3. *build_central* — Pase MCO → Pase SD → Desmarque MCD → Pase DC → Tiro MCDI
 4. *build_paciente* — Pase DFI → Pase MCDI → Pase SD → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase DFI → Pase MCDI → Pase MCO → Desmarque DC → Tiro DC
 6. *build_paciente* — Pase DFI → Pase MCDI → Pase MCD → Desmarque DC → Tiro MCDI
 7. *switch_play* — Pase MCD → Pase MCDD → Regate MCDI → Pase MCDD → Remate DC
 8. *switch_play* — Pase SD → Pase MCDD → Regate MCDI → Pase MCO → Remate DC
 9. *wing_overlap* — Pase MCO → Regate MCDI → Pase LI → Pase MCDI → Remate DC
10. *wing_overlap* — Pase MCD → Regate MCDI → Pase LI → Pase MCDI → Remate DC
11. *wing_cutback* — Pase MCDI → Regate MCDI → Desmarque MCO → Pase MCDI → Tiro DC
12. *wing_cutback* — Pase MCDI → Regate MCDI → Desmarque MCO → Pase MCDI → Tiro DC
13. *through_ball* — Pase DFI → Pase MCO → Desmarque MCD → Desmarque DC → Tiro DC
14. *through_ball* — Pase DFI → Pase MCD → Desmarque SD → Desmarque DC → Tiro DC
15. *through_ball* — Pase DFI → Pase SD → Desmarque MCD → Desmarque DC → Tiro MCDI
16. *give_and_go* — Pase MCD → Pase DC → Desmarque SD → Pase DC → Tiro DC
17. *give_and_go* — Pase SD → Pase DC → Desmarque MCO → Pase DC → Tiro DC
18. *give_and_go* — Pase MCO → Pase DC → Desmarque MCD → Pase DC → Tiro MCDI
19. *counter* — Pase DFI → Regate MCDI → Pase SD → Desmarque DC → Tiro DC
20. *counter* — Pase DFI → Regate MCDI → Pase MCO → Desmarque DC → Tiro DC
21. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
22. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate DC
23. *long_shot* — Pase SD → Regate MCD → Tiro DC
24. *long_shot* — Pase SD → Regate MCD → Tiro DC
25. *long_shot* — Pase SD → Regate MCD → Tiro MCDI
26. *solo_run* — Regate MCDI → Regate MCDI → Regate DC → Tiro DC
27. *solo_run* — Regate MCDI → Regate MCDI → Regate DC → Tiro DC
28. *overload* — Pase MCDI → Desmarque LI → Pase MCD → Desmarque DC → Remate DC
29. *overload* — Pase MCDI → Desmarque LI → Pase SD → Desmarque DC → Remate DC
30. *third_man* — Pase MCD → Pase MCO → Pase MCDI → Desmarque DC → Tiro DC
31. *third_man* — Pase MCD → Pase SD → Pase MCDI → Desmarque DC → Tiro DC
32. *third_man* — Pase MCD → Pase MCO → Pase MCDI → Desmarque DC → Tiro MCDI
33. *carrilero_run* — Pase MCD → Desmarque MCDI → Pase MCO → Remate DC
34. *carrilero_run* — Pase DFD → Desmarque MCDI → Pase MCO → Remate DC

### 4-3-2-1 · ataque por centro (34 jugadas)

 1. *build_central* — Pase MCO → Pase SD → Desmarque MCD → Pase DC → Tiro DC
 2. *build_central* — Pase MCD → Pase MCO → Desmarque DC → Pase DC → Tiro MCO
 3. *build_central* — Pase SD → Pase MCO → Desmarque SD → Pase DC → Tiro DC
 4. *build_paciente* — Pase DFI → Pase SD → Pase MCO → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase DFI → Pase MCO → Pase MCD → Desmarque DC → Tiro MCO
 6. *build_paciente* — Pase DFI → Pase MCD → Pase SD → Desmarque DC → Tiro DC
 7. *switch_play* — Pase MCO → Pase SD → Regate MCD → Pase SD → Remate DC
 8. *switch_play* — Pase MCD → Pase MCO → Regate MCO → Pase MCD → Remate SD
 9. *wing_overlap* — Pase SD → Regate MCO → Pase DFI → Pase DC → Remate DC
10. *wing_overlap* — Pase MCO → Regate SD → Pase DFD → Pase MCD → Remate SD
11. *wing_cutback* — Pase MCD → Regate DC → Desmarque SD → Pase MCD → Tiro DC
12. *wing_cutback* — Pase SD → Regate MCD → Desmarque SD → Pase DC → Tiro MCD
13. *through_ball* — Pase DFI → Pase SD → Desmarque MCD → Desmarque DC → Tiro DC
14. *through_ball* — Pase DFI → Pase MCO → Desmarque SD → Desmarque DC → Tiro MCO
15. *through_ball* — Pase DFI → Pase MCD → Desmarque MCO → Desmarque DC → Tiro DC
16. *give_and_go* — Pase MCO → Pase DC → Desmarque MCD → Pase DC → Tiro DC
17. *give_and_go* — Pase MCD → Pase DC → Desmarque SD → Pase DC → Tiro MCO
18. *give_and_go* — Pase SD → Pase DC → Desmarque MCO → Pase DC → Tiro DC
19. *counter* — Pase DFI → Regate DC → Pase MCD → Desmarque DC → Tiro DC
20. *counter* — Pase DFI → Regate MCD → Pase SD → Desmarque DC → Tiro MCO
21. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
22. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate SD
23. *long_shot* — Pase MCD → Regate MCO → Tiro DC
24. *long_shot* — Pase MCD → Regate MCO → Tiro SD
25. *long_shot* — Pase MCD → Regate MCO → Tiro DC
26. *solo_run* — Regate MCD → Regate MCD → Regate DC → Tiro DC
27. *solo_run* — Regate MCO → Regate MCD → Regate DC → Tiro MCO
28. *overload* — Pase SD → Desmarque DFI → Pase MCO → Desmarque DC → Remate DC
29. *overload* — Pase MCO → Desmarque DFD → Pase MCD → Desmarque DC → Remate SD
30. *third_man* — Pase MCD → Pase MCO → Pase SD → Desmarque DC → Tiro DC
31. *third_man* — Pase MCD → Pase SD → Pase MCD → Desmarque DC → Tiro MCD
32. *third_man* — Pase MCD → Pase MCO → Pase SD → Desmarque DC → Tiro DC
33. *carrilero_run* — Pase MCD → Desmarque SD → Pase MCD → Remate DC
34. *carrilero_run* — Pase DFD → Desmarque SD → Pase MCD → Remate SD

### 4-3-2-1 · ataque por derecha (34 jugadas)

 1. *build_central* — Pase SD → Pase MCO → Desmarque SD → Pase DC → Tiro DC
 2. *build_central* — Pase MCO → Pase MCD → Desmarque MCO → Pase DC → Tiro DC
 3. *build_central* — Pase MCD → Pase SD → Desmarque DC → Pase DC → Tiro MCDD
 4. *build_paciente* — Pase DFI → Pase MCDD → Pase MCO → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase DFI → Pase MCDD → Pase MCD → Desmarque DC → Tiro DC
 6. *build_paciente* — Pase DFI → Pase MCDD → Pase SD → Desmarque DC → Tiro MCDD
 7. *switch_play* — Pase SD → Pase MCDI → Regate MCDD → Pase MCD → Remate DC
 8. *switch_play* — Pase MCO → Pase MCDI → Regate MCDD → Pase MCO → Remate DC
 9. *wing_overlap* — Pase MCD → Regate MCDD → Pase LD → Pase MCDD → Remate DC
10. *wing_overlap* — Pase SD → Regate MCDD → Pase LD → Pase MCDD → Remate DC
11. *wing_cutback* — Pase MCDD → Regate MCDD → Desmarque MCO → Pase MCDD → Tiro DC
12. *wing_cutback* — Pase MCDD → Regate MCDD → Desmarque MCO → Pase MCDD → Tiro DC
13. *through_ball* — Pase DFI → Pase MCD → Desmarque MCO → Desmarque DC → Tiro DC
14. *through_ball* — Pase DFI → Pase SD → Desmarque MCO → Desmarque DC → Tiro DC
15. *through_ball* — Pase DFI → Pase MCO → Desmarque MCD → Desmarque DC → Tiro MCDD
16. *give_and_go* — Pase SD → Pase DC → Desmarque MCO → Pase DC → Tiro DC
17. *give_and_go* — Pase MCO → Pase DC → Desmarque MCD → Pase DC → Tiro DC
18. *give_and_go* — Pase MCD → Pase DC → Desmarque SD → Pase DC → Tiro MCDD
19. *counter* — Pase DFI → Regate MCDD → Pase MCO → Desmarque DC → Tiro DC
20. *counter* — Pase DFI → Regate MCDD → Pase MCD → Desmarque DC → Tiro DC
21. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
22. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate DC
23. *long_shot* — Pase MCO → Regate SD → Tiro DC
24. *long_shot* — Pase MCO → Regate SD → Tiro DC
25. *long_shot* — Pase MCO → Regate SD → Tiro MCDD
26. *solo_run* — Regate MCDD → Regate MCDD → Regate DC → Tiro DC
27. *solo_run* — Regate MCDD → Regate MCDD → Regate DC → Tiro DC
28. *overload* — Pase MCDD → Desmarque LD → Pase SD → Desmarque DC → Remate DC
29. *overload* — Pase MCDD → Desmarque LD → Pase MCO → Desmarque DC → Remate DC
30. *third_man* — Pase MCD → Pase MCO → Pase MCDD → Desmarque DC → Tiro DC
31. *third_man* — Pase MCD → Pase SD → Pase MCDD → Desmarque DC → Tiro DC
32. *third_man* — Pase MCD → Pase MCO → Pase MCDD → Desmarque DC → Tiro MCDD
33. *carrilero_run* — Pase MCD → Desmarque MCDD → Pase MCO → Remate DC
34. *carrilero_run* — Pase DFD → Desmarque MCDD → Pase MCO → Remate DC

## 4-1-2-1-2
*93 jugadas de campo · izquierda 31 · centro 31 · derecha 31*

**Dibujo (posiciones de campo):** Defensa: LI · DFI · DFD · LD  |  Mediocampo: MCD · MI · MD · MCO  |  Ataque: SD · DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **MCD** (Pivote): Pase ×62, Desmarque ×11, Regate ×10, Tiro ×4, Remate ×1 · ⚽×5
- **DC** (Delantero centro): Desmarque ×31, Tiro ×30, Pase ×15, Remate ×8, Regate ×3 · ⚽×38
- **SD** (Segundo delantero): Desmarque ×28, Tiro ×20, Pase ×19, Remate ×11, Regate ×7 · ⚽×31
- **MCO** (Mediapunta): Pase ×59, Desmarque ×12, Regate ×6, Tiro ×4, Remate ×1 · ⚽×5
- **MI** (Medio izquierdo): Pase ×14, Regate ×11, Tiro ×7, Desmarque ×1 · ⚽×7
- **MD** (Medio derecho): Pase ×12, Regate ×11, Tiro ×7, Desmarque ×1 · ⚽×7
- **DFI** (Central izquierdo): Pase ×15
- **DFD** (Central derecho): Pase ×12, Desmarque ×1
- **LD** (Lateral derecho): Pase ×1, Desmarque ×1
- **LI** (Lateral izquierdo): Pase ×1, Desmarque ×1

### 4-1-2-1-2 · ataque por izquierda (31 jugadas)

 1. *build_central* — Pase MCD → Pase MCO → Desmarque DC → Pase SD → Tiro DC
 2. *build_central* — Pase MCO → Pase MCD → Desmarque SD → Pase DC → Tiro SD
 3. *build_central* — Pase MCD → Pase MCO → Desmarque MCD → Pase DC → Tiro MI
 4. *build_paciente* — Pase MCO → Pase MI → Pase MCO → Desmarque SD → Tiro DC
 5. *build_paciente* — Pase DFI → Pase MI → Pase MCD → Desmarque DC → Tiro SD
 6. *build_paciente* — Pase DFD → Pase MI → Pase MCO → Desmarque SD → Tiro MI
 7. *switch_play* — Pase MCD → Pase MD → Regate MI → Pase MCD → Remate SD
 8. *switch_play* — Pase MCO → Pase MD → Regate MI → Pase MCO → Remate DC
 9. *wing_overlap* — Pase MCD → Regate MI → Pase LI → Pase MI → Remate SD
10. *wing_cutback* — Pase MI → Regate MI → Desmarque MCO → Pase MI → Tiro DC
11. *through_ball* — Pase MCD → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SD
12. *through_ball* — Pase MCO → Pase MCD → Desmarque MCO → Desmarque SD → Tiro DC
13. *through_ball* — Pase DFI → Pase MCO → Desmarque MCD → Desmarque DC → Tiro MI
14. *give_and_go* — Pase MCO → Pase SD → Desmarque MCO → Pase SD → Tiro DC
15. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD → Pase DC → Tiro SD
16. *give_and_go* — Pase MCO → Pase SD → Desmarque MCO → Pase SD → Tiro MI
17. *counter* — Pase DFI → Regate MI → Pase MCD → Desmarque DC → Tiro SD
18. *counter* — Pase DFD → Regate MI → Pase MCO → Desmarque SD → Tiro DC
19. *counter* — Pase MCD → Regate MI → Pase MCD → Desmarque DC → Tiro MI
20. *long_ball* — Pase DFD → Desmarque SD → Pase DC → Desmarque SD → Remate DC
21. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate SD
22. *long_shot* — Pase MCO → Regate MCD → Tiro DC
23. *long_shot* — Pase MCD → Regate MCO → Tiro SD
24. *long_shot* — Pase MCO → Regate MCD → Tiro MI
25. *solo_run* — Regate MI → Regate MI → Regate SD → Tiro DC
26. *solo_run* — Regate MI → Regate MI → Regate SD → Tiro DC
27. *overload* — Pase MI → Desmarque LI → Pase MCD → Desmarque DC → Remate SD
28. *third_man* — Pase MCO → Pase MCD → Pase MI → Desmarque SD → Tiro DC
29. *third_man* — Pase DFI → Pase MCO → Pase MI → Desmarque DC → Tiro SD
30. *third_man* — Pase DFD → Pase MCD → Pase MI → Desmarque SD → Tiro MI
31. *carrilero_run* — Pase MCD → Desmarque MI → Pase MCD → Remate DC

### 4-1-2-1-2 · ataque por centro (31 jugadas)

 1. *build_central* — Pase MCD → Pase MCO → Desmarque SD → Pase DC → Tiro SD
 2. *build_central* — Pase MCO → Pase MCD → Desmarque MCO → Pase SD → Tiro MCO
 3. *build_central* — Pase MCD → Pase MCO → Desmarque DC → Pase SD → Tiro DC
 4. *build_paciente* — Pase DFD → Pase MCD → Pase MCO → Desmarque SD → Tiro DC
 5. *build_paciente* — Pase MCD → Pase MCO → Pase MCD → Desmarque DC → Tiro MCD
 6. *build_paciente* — Pase MCO → Pase MCD → Pase MCO → Desmarque SD → Tiro DC
 7. *switch_play* — Pase MCD → Pase MCO → Regate SD → Pase MCO → Remate SD
 8. *switch_play* — Pase MCO → Pase MCD → Regate DC → Pase MCD → Remate MCO
 9. *wing_overlap* — Pase MCD → Regate DC → Pase DFI → Pase MCO → Remate SD
10. *wing_cutback* — Pase MCO → Regate MCD → Desmarque SD → Pase DC → Tiro SD
11. *through_ball* — Pase DFI → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SD
12. *through_ball* — Pase DFD → Pase MCD → Desmarque MCO → Desmarque SD → Tiro MCO
13. *through_ball* — Pase MCD → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SD
14. *give_and_go* — Pase MCO → Pase SD → Desmarque MCO → Pase SD → Tiro DC
15. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD → Pase DC → Tiro MCD
16. *give_and_go* — Pase MCO → Pase SD → Desmarque MCO → Pase SD → Tiro DC
17. *counter* — Pase MCD → Regate DC → Pase MCD → Desmarque DC → Tiro SD
18. *counter* — Pase MCO → Regate MCD → Pase MCO → Desmarque SD → Tiro MCO
19. *counter* — Pase DFI → Regate MCO → Pase MCD → Desmarque DC → Tiro SD
20. *long_ball* — Pase DFD → Desmarque SD → Pase DC → Desmarque SD → Remate DC
21. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate MCD
22. *long_shot* — Pase MCO → Regate MCD → Tiro DC
23. *long_shot* — Pase MCD → Regate MCO → Tiro MCD
24. *long_shot* — Pase MCO → Regate MCD → Tiro DC
25. *solo_run* — Regate MCD → Regate MCO → Regate SD → Tiro DC
26. *solo_run* — Regate MCD → Regate MCO → Regate SD → Tiro MCO
27. *overload* — Pase MCD → Desmarque DFD → Pase MCD → Desmarque DC → Remate SD
28. *third_man* — Pase DFD → Pase MCD → Pase MCO → Desmarque SD → Tiro DC
29. *third_man* — Pase MCD → Pase MCO → Pase MCD → Desmarque DC → Tiro MCD
30. *third_man* — Pase MCO → Pase MCD → Pase MCO → Desmarque SD → Tiro DC
31. *carrilero_run* — Pase DFI → Desmarque MCO → Pase MCD → Remate DC

### 4-1-2-1-2 · ataque por derecha (31 jugadas)

 1. *build_central* — Pase MCD → Pase MCO → Desmarque MCD → Pase DC → Tiro SD
 2. *build_central* — Pase MCO → Pase MCD → Desmarque DC → Pase SD → Tiro DC
 3. *build_central* — Pase MCD → Pase MCO → Desmarque SD → Pase DC → Tiro MD
 4. *build_paciente* — Pase MCO → Pase MD → Pase MCO → Desmarque SD → Tiro DC
 5. *build_paciente* — Pase DFI → Pase MD → Pase MCD → Desmarque DC → Tiro SD
 6. *build_paciente* — Pase DFD → Pase MD → Pase MCO → Desmarque SD → Tiro MD
 7. *switch_play* — Pase MCD → Pase MI → Regate MD → Pase MI → Remate SD
 8. *switch_play* — Pase MCO → Pase MI → Regate MD → Pase MCD → Remate DC
 9. *wing_overlap* — Pase MCD → Regate MD → Pase LD → Pase MD → Remate SD
10. *wing_cutback* — Pase MD → Regate MD → Desmarque DC → Pase MD → Tiro DC
11. *through_ball* — Pase MCD → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SD
12. *through_ball* — Pase MCO → Pase MCD → Desmarque MCO → Desmarque SD → Tiro DC
13. *through_ball* — Pase DFI → Pase MCO → Desmarque MCD → Desmarque DC → Tiro MD
14. *give_and_go* — Pase MCO → Pase SD → Desmarque MCO → Pase SD → Tiro DC
15. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD → Pase DC → Tiro SD
16. *give_and_go* — Pase MCO → Pase SD → Desmarque MCO → Pase SD → Tiro MD
17. *counter* — Pase DFI → Regate MD → Pase MCD → Desmarque DC → Tiro SD
18. *counter* — Pase DFD → Regate MD → Pase MCO → Desmarque SD → Tiro DC
19. *counter* — Pase MCD → Regate MD → Pase MCD → Desmarque DC → Tiro MD
20. *long_ball* — Pase DFD → Desmarque SD → Pase DC → Desmarque SD → Remate DC
21. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate SD
22. *long_shot* — Pase MCO → Regate MCD → Tiro DC
23. *long_shot* — Pase MCD → Regate MCO → Tiro SD
24. *long_shot* — Pase MCO → Regate MCD → Tiro MD
25. *solo_run* — Regate MD → Regate MD → Regate SD → Tiro DC
26. *solo_run* — Regate MD → Regate MD → Regate SD → Tiro DC
27. *overload* — Pase MD → Desmarque LD → Pase MCD → Desmarque DC → Remate SD
28. *third_man* — Pase MCO → Pase MCD → Pase MD → Desmarque SD → Tiro DC
29. *third_man* — Pase DFI → Pase MCO → Pase MD → Desmarque DC → Tiro SD
30. *third_man* — Pase DFD → Pase MCD → Pase MD → Desmarque SD → Tiro MD
31. *carrilero_run* — Pase MCD → Desmarque MD → Pase MI → Remate DC

## 4-1-3-2
*93 jugadas de campo · izquierda 31 · centro 31 · derecha 31*

**Dibujo (posiciones de campo):** Defensa: LI · DFI · DFD · LD  |  Mediocampo: MCD · MI · MCO · MD  |  Ataque: SD · DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×27, Tiro ×26, Pase ×15, Remate ×13, Regate ×4 · ⚽×39
- **SD** (Segundo delantero): Desmarque ×25, Tiro ×21, Pase ×17, Remate ×13, Regate ×8 · ⚽×34
- **MCD** (Pivote): Pase ×61, Desmarque ×7, Tiro ×6, Regate ×5, Remate ×3 · ⚽×9
- **MCO** (Mediapunta): Pase ×58, Desmarque ×11, Regate ×8, Tiro ×3, Remate ×2 · ⚽×5
- **MI** (Medio izquierdo): Pase ×18, Regate ×13, Desmarque ×4, Tiro ×2, Remate ×1 · ⚽×3
- **MD** (Medio derecho): Pase ×17, Regate ×13, Desmarque ×4, Tiro ×2, Remate ×1 · ⚽×3
- **DFD** (Central derecho): Pase ×12, Desmarque ×1
- **DFI** (Central izquierdo): Pase ×11, Desmarque ×1
- **LD** (Lateral derecho): Pase ×2, Desmarque ×2
- **LI** (Lateral izquierdo): Pase ×2, Desmarque ×2

### 4-1-3-2 · ataque por izquierda (31 jugadas)

 1. *build_central* — Pase MCD → Pase MCO → Desmarque DC → Pase SD → Tiro DC
 2. *build_central* — Pase MCO → Pase MCD → Desmarque SD → Pase DC → Tiro SD
 3. *build_paciente* — Pase MCD → Pase MI → Pase MCD → Desmarque DC → Tiro SD
 4. *build_paciente* — Pase MCO → Pase MI → Pase MCO → Desmarque SD → Tiro DC
 5. *switch_play* — Pase MCD → Pase MD → Regate MI → Pase MD → Remate SD
 6. *switch_play* — Pase MCO → Pase MD → Regate MI → Pase MCO → Remate DC
 7. *switch_play* — Pase MCD → Pase MD → Regate MI → Pase MCD → Remate MI
 8. *wing_overlap* — Pase MCO → Regate MI → Pase LI → Pase MI → Remate DC
 9. *wing_overlap* — Pase MCD → Regate MI → Pase LI → Pase MI → Remate SD
10. *wing_cutback* — Pase MI → Regate MI → Desmarque MD → Pase MI → Tiro DC
11. *wing_cutback* — Pase MI → Regate MI → Desmarque MD → Pase MI → Tiro SD
12. *through_ball* — Pase MCO → Pase MCD → Desmarque MCO → Desmarque SD → Tiro DC
13. *through_ball* — Pase DFI → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SD
14. *give_and_go* — Pase MCO → Pase SD → Desmarque MCO → Pase SD → Tiro DC
15. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD → Pase DC → Tiro SD
16. *give_and_go* — Pase MCO → Pase SD → Desmarque MCO → Pase SD → Tiro MI
17. *counter* — Pase DFI → Regate MI → Pase MCD → Desmarque DC → Tiro SD
18. *counter* — Pase DFD → Regate MI → Pase MCO → Desmarque SD → Tiro DC
19. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate SD
20. *long_ball* — Pase DFD → Desmarque SD → Pase DC → Desmarque SD → Remate DC
21. *long_shot* — Pase MCD → Regate MCO → Tiro SD
22. *long_shot* — Pase MCO → Regate MCD → Tiro DC
23. *solo_run* — Regate MI → Regate MI → Regate SD → Tiro DC
24. *solo_run* — Regate MI → Regate MI → Regate SD → Tiro DC
25. *overload* — Pase MI → Desmarque LI → Pase MCD → Desmarque DC → Remate SD
26. *overload* — Pase MI → Desmarque LI → Pase MCO → Desmarque SD → Remate DC
27. *third_man* — Pase DFI → Pase MCO → Pase MI → Desmarque DC → Tiro SD
28. *third_man* — Pase DFD → Pase MCD → Pase MI → Desmarque SD → Tiro DC
29. *third_man* — Pase MCD → Pase MCO → Pase MI → Desmarque DC → Tiro MI
30. *carrilero_run* — Pase MCO → Desmarque MI → Pase MCD → Remate SD
31. *carrilero_run* — Pase MCO → Desmarque MI → Pase MCO → Remate SD

### 4-1-3-2 · ataque por centro (31 jugadas)

 1. *build_central* — Pase MCO → Pase MCD → Desmarque DC → Pase SD → Tiro DC
 2. *build_central* — Pase MCD → Pase MCO → Desmarque SD → Pase DC → Tiro MCD
 3. *build_paciente* — Pase DFD → Pase MCD → Pase MCO → Desmarque SD → Tiro DC
 4. *build_paciente* — Pase MCD → Pase MCO → Pase MCD → Desmarque DC → Tiro MCD
 5. *switch_play* — Pase MCO → Pase MCD → Regate MCO → Pase MCD → Remate DC
 6. *switch_play* — Pase MCD → Pase MCO → Regate SD → Pase MCO → Remate MCD
 7. *switch_play* — Pase MCO → Pase MCD → Regate DC → Pase MCD → Remate DC
 8. *wing_overlap* — Pase MCD → Regate DC → Pase DFI → Pase MCO → Remate SD
 9. *wing_overlap* — Pase MCO → Regate MCD → Pase DFD → Pase SD → Remate MCO
10. *wing_cutback* — Pase MCD → Regate MCO → Desmarque DC → Pase MCD → Tiro SD
11. *wing_cutback* — Pase MCO → Regate SD → Desmarque MCO → Pase DC → Tiro MCO
12. *through_ball* — Pase MCD → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SD
13. *through_ball* — Pase MCO → Pase MCD → Desmarque MCO → Desmarque SD → Tiro MCO
14. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD → Pase DC → Tiro SD
15. *give_and_go* — Pase MCO → Pase SD → Desmarque MCO → Pase SD → Tiro MCO
16. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD → Pase DC → Tiro SD
17. *counter* — Pase MCO → Regate MCD → Pase MCO → Desmarque SD → Tiro DC
18. *counter* — Pase DFI → Regate MCO → Pase MCD → Desmarque DC → Tiro MCD
19. *long_ball* — Pase DFD → Desmarque SD → Pase DC → Desmarque SD → Remate DC
20. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate MCD
21. *long_shot* — Pase MCO → Regate MCD → Tiro DC
22. *long_shot* — Pase MCD → Regate MCO → Tiro MCD
23. *solo_run* — Regate MCO → Regate SD → Regate DC → Tiro SD
24. *solo_run* — Regate MCO → Regate SD → Regate DC → Tiro MCD
25. *overload* — Pase MCO → Desmarque DFI → Pase MCO → Desmarque SD → Remate DC
26. *overload* — Pase MCD → Desmarque DFD → Pase MCD → Desmarque DC → Remate MCD
27. *third_man* — Pase MCO → Pase MCD → Pase MCO → Desmarque SD → Tiro DC
28. *third_man* — Pase DFI → Pase MCO → Pase MCD → Desmarque DC → Tiro MCD
29. *third_man* — Pase DFD → Pase MCD → Pase MCO → Desmarque SD → Tiro DC
30. *carrilero_run* — Pase MCD → Desmarque MCO → Pase MCD → Remate DC
31. *carrilero_run* — Pase MCD → Desmarque MCO → Pase MCD → Remate MCO

### 4-1-3-2 · ataque por derecha (31 jugadas)

 1. *build_central* — Pase MCD → Pase MCO → Desmarque DC → Pase SD → Tiro DC
 2. *build_central* — Pase MCO → Pase MCD → Desmarque SD → Pase DC → Tiro SD
 3. *build_paciente* — Pase DFI → Pase MD → Pase MCD → Desmarque DC → Tiro SD
 4. *build_paciente* — Pase DFD → Pase MD → Pase MCO → Desmarque SD → Tiro DC
 5. *switch_play* — Pase MCD → Pase MI → Regate MD → Pase MCO → Remate SD
 6. *switch_play* — Pase MCO → Pase MI → Regate MD → Pase MI → Remate DC
 7. *switch_play* — Pase MCD → Pase MI → Regate MD → Pase MCD → Remate MD
 8. *wing_overlap* — Pase MCO → Regate MD → Pase LD → Pase MD → Remate DC
 9. *wing_overlap* — Pase MCD → Regate MD → Pase LD → Pase MD → Remate SD
10. *wing_cutback* — Pase MD → Regate MD → Desmarque MI → Pase MD → Tiro DC
11. *wing_cutback* — Pase MD → Regate MD → Desmarque MI → Pase MD → Tiro SD
12. *through_ball* — Pase DFD → Pase MCD → Desmarque MCO → Desmarque SD → Tiro DC
13. *through_ball* — Pase MCD → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SD
14. *give_and_go* — Pase MCO → Pase SD → Desmarque MCO → Pase SD → Tiro DC
15. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD → Pase DC → Tiro SD
16. *give_and_go* — Pase MCO → Pase SD → Desmarque MCO → Pase SD → Tiro MD
17. *counter* — Pase MCD → Regate MD → Pase MCD → Desmarque DC → Tiro SD
18. *counter* — Pase MCO → Regate MD → Pase MCO → Desmarque SD → Tiro DC
19. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate SD
20. *long_ball* — Pase DFD → Desmarque SD → Pase DC → Desmarque SD → Remate DC
21. *long_shot* — Pase MCD → Regate MCO → Tiro SD
22. *long_shot* — Pase MCO → Regate MCD → Tiro DC
23. *solo_run* — Regate MD → Regate MD → Regate SD → Tiro DC
24. *solo_run* — Regate MD → Regate MD → Regate SD → Tiro DC
25. *overload* — Pase MD → Desmarque LD → Pase MCD → Desmarque DC → Remate SD
26. *overload* — Pase MD → Desmarque LD → Pase MCO → Desmarque SD → Remate DC
27. *third_man* — Pase MCD → Pase MCO → Pase MD → Desmarque DC → Tiro SD
28. *third_man* — Pase MCO → Pase MCD → Pase MD → Desmarque SD → Tiro DC
29. *third_man* — Pase DFI → Pase MCO → Pase MD → Desmarque DC → Tiro MD
30. *carrilero_run* — Pase DFD → Desmarque MD → Pase MCD → Remate SD
31. *carrilero_run* — Pase DFD → Desmarque MD → Pase MI → Remate SD

## 3-5-2
*105 jugadas de campo · izquierda 35 · centro 35 · derecha 35*

**Dibujo (posiciones de campo):** Defensa: DFI · DFC · DFD  |  Mediocampo: MVI · MCDI · MCO · MCDD · MVD  |  Ataque: SD · DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×28, Tiro ×26, Pase ×19, Remate ×13, Regate ×3 · ⚽×39
- **SD** (Segundo delantero): Desmarque ×29, Tiro ×25, Pase ×17, Remate ×13, Regate ×4 · ⚽×38
- **MCDD** (Pivote derecho): Pase ×45, Desmarque ×14, Regate ×13, Tiro ×5, Remate ×1 · ⚽×6
- **MCDI** (Pivote izquierdo): Pase ×51, Desmarque ×10, Remate ×4, Tiro ×2, Regate ×1 · ⚽×6
- **MCO** (Mediapunta): Pase ×49, Regate ×7, Desmarque ×4, Tiro ×2 · ⚽×2
- **MVD** (Carrilero derecho): Pase ×20, Regate ×13, Tiro ×6, Desmarque ×3, Remate ×1 · ⚽×7
- **MVI** (Carrilero izquierdo): Pase ×18, Regate ×13, Tiro ×6, Desmarque ×2, Remate ×1 · ⚽×7
- **DFC** (Central): Pase ×17, Desmarque ×2
- **DFD** (Central derecho): Pase ×2, Desmarque ×2
- **DFI** (Central izquierdo): Pase ×2, Desmarque ×2

### 3-5-2 · ataque por izquierda (35 jugadas)

 1. *build_central* — Pase MCDI → Pase MCDD → Desmarque SD → Pase DC → Tiro SD
 2. *build_central* — Pase MCDD → Pase MCDI → Desmarque DC → Pase SD → Tiro DC
 3. *build_central* — Pase MCO → Pase MCDD → Desmarque MCDI → Pase DC → Tiro MVI
 4. *build_paciente* — Pase MCDD → Pase MVI → Pase MCDD → Desmarque SD → Tiro DC
 5. *build_paciente* — Pase DFC → Pase MVI → Pase MCO → Desmarque DC → Tiro SD
 6. *build_paciente* — Pase MCDI → Pase MVI → Pase MCDI → Desmarque SD → Tiro MVI
 7. *switch_play* — Pase MCDI → Pase MVD → Regate MVI → Pase MCO → Remate SD
 8. *switch_play* — Pase MCDD → Pase MVD → Regate MVI → Pase MCDD → Remate DC
 9. *switch_play* — Pase MCO → Pase MVD → Regate MVI → Pase MVD → Remate MVI
10. *wing_overlap* — Pase MCDI → Regate MVI → Pase DFI → Pase MVI → Remate DC
11. *wing_overlap* — Pase MCDD → Regate MVI → Pase DFI → Pase MVI → Remate SD
12. *wing_cutback* — Pase MVI → Regate MVI → Desmarque MVD → Pase MVI → Tiro DC
13. *wing_cutback* — Pase MVI → Regate MVI → Desmarque MCDD → Pase MVI → Tiro SD
14. *through_ball* — Pase MCDI → Pase MCO → Desmarque MCDD → Desmarque SD → Tiro DC
15. *through_ball* — Pase MCO → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro SD
16. *through_ball* — Pase MCDD → Pase MCDI → Desmarque MCDD → Desmarque SD → Tiro MVI
17. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCO → Pase DC → Tiro SD
18. *give_and_go* — Pase MCO → Pase SD → Desmarque MCDI → Pase SD → Tiro DC
19. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCDD → Pase DC → Tiro MVI
20. *counter* — Pase MCDD → Regate MVI → Pase MCO → Desmarque SD → Tiro DC
21. *counter* — Pase DFC → Regate MVI → Pase MCDI → Desmarque DC → Tiro SD
22. *long_ball* — Pase DFC → Desmarque SD → Pase DC → Desmarque SD → Remate DC
23. *long_ball* — Pase DFC → Desmarque DC → Pase SD → Desmarque DC → Remate SD
24. *long_shot* — Pase MCO → Regate MCDD → Tiro DC
25. *long_shot* — Pase MCO → Regate MCDD → Tiro SD
26. *long_shot* — Pase MCO → Regate MCDD → Tiro MVI
27. *solo_run* — Regate MVI → Regate MVI → Regate SD → Tiro DC
28. *solo_run* — Regate MVI → Regate MVI → Regate SD → Tiro DC
29. *overload* — Pase MVI → Desmarque DFI → Pase MCDD → Desmarque DC → Remate SD
30. *overload* — Pase MVI → Desmarque DFI → Pase MCO → Desmarque SD → Remate DC
31. *third_man* — Pase MCO → Pase MCDD → Pase MVI → Desmarque DC → Tiro SD
32. *third_man* — Pase MCDD → Pase MCDI → Pase MVI → Desmarque SD → Tiro DC
33. *third_man* — Pase DFC → Pase MCDI → Pase MVI → Desmarque DC → Tiro MVI
34. *carrilero_run* — Pase MCDI → Desmarque MVI → Pase MVD → Remate SD
35. *carrilero_run* — Pase MCDI → Desmarque MVI → Pase MVD → Remate SD

### 3-5-2 · ataque por centro (35 jugadas)

 1. *build_central* — Pase MCDI → Pase MCO → Desmarque DC → Pase SD → Tiro DC
 2. *build_central* — Pase MCDD → Pase MCO → Desmarque MCDI → Pase DC → Tiro MCDI
 3. *build_central* — Pase MCO → Pase MCDI → Desmarque MCDD → Pase SD → Tiro DC
 4. *build_paciente* — Pase DFC → Pase MCO → Pase MCDI → Desmarque DC → Tiro SD
 5. *build_paciente* — Pase MCDI → Pase MCO → Pase MCDD → Desmarque SD → Tiro MCDI
 6. *build_paciente* — Pase MCO → Pase MCDD → Pase MCDI → Desmarque DC → Tiro SD
 7. *switch_play* — Pase MCDI → Pase MCO → Regate MCDD → Pase MCDI → Remate DC
 8. *switch_play* — Pase MCDD → Pase MCO → Regate MCDD → Pase MCO → Remate MCDI
 9. *switch_play* — Pase MCO → Pase MCDI → Regate MCDD → Pase MCDI → Remate DC
10. *wing_overlap* — Pase MCDI → Regate MCO → Pase DFC → Pase SD → Remate DC
11. *wing_overlap* — Pase MCDD → Regate MCO → Pase DFC → Pase SD → Remate MCDI
12. *wing_cutback* — Pase MCO → Regate MCO → Desmarque SD → Pase DC → Tiro SD
13. *wing_cutback* — Pase MCDI → Regate MCO → Desmarque DC → Pase MCDI → Tiro MCDD
14. *through_ball* — Pase MCO → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro SD
15. *through_ball* — Pase MCDD → Pase MCDI → Desmarque MCDD → Desmarque SD → Tiro MCDD
16. *through_ball* — Pase DFC → Pase MCO → Desmarque MCDI → Desmarque DC → Tiro SD
17. *give_and_go* — Pase MCDD → Pase SD → Desmarque MCO → Pase SD → Tiro DC
18. *give_and_go* — Pase MCO → Pase DC → Desmarque MCDI → Pase DC → Tiro MCDD
19. *give_and_go* — Pase MCDI → Pase SD → Desmarque MCDD → Pase SD → Tiro DC
20. *counter* — Pase DFC → Regate MCO → Pase MCDI → Desmarque DC → Tiro SD
21. *counter* — Pase MCDI → Regate MCO → Pase MCDD → Desmarque SD → Tiro MCDD
22. *long_ball* — Pase DFC → Desmarque DC → Pase SD → Desmarque DC → Remate SD
23. *long_ball* — Pase DFC → Desmarque SD → Pase DC → Desmarque SD → Remate MCDI
24. *long_shot* — Pase MCO → Regate MCDD → Tiro SD
25. *long_shot* — Pase MCO → Regate MCDD → Tiro MCO
26. *long_shot* — Pase MCO → Regate MCDD → Tiro SD
27. *solo_run* — Regate MCO → Regate MCDI → Regate DC → Tiro SD
28. *solo_run* — Regate MCDD → Regate DC → Regate DC → Tiro MCDD
29. *overload* — Pase MCDI → Desmarque DFC → Pase MCDD → Desmarque SD → Remate DC
30. *overload* — Pase MCDD → Desmarque DFC → Pase MCO → Desmarque DC → Remate MCDI
31. *third_man* — Pase MCDD → Pase MCDI → Pase MCDD → Desmarque SD → Tiro DC
32. *third_man* — Pase DFC → Pase MCO → Pase MCDI → Desmarque DC → Tiro MCO
33. *third_man* — Pase MCDI → Pase MCO → Pase MCDD → Desmarque SD → Tiro DC
34. *carrilero_run* — Pase MCO → Desmarque MCDD → Pase MCDI → Remate DC
35. *carrilero_run* — Pase MCO → Desmarque MCDD → Pase MCDI → Remate MCDD

### 3-5-2 · ataque por derecha (35 jugadas)

 1. *build_central* — Pase MCDI → Pase MCDD → Desmarque MCDI → Pase DC → Tiro SD
 2. *build_central* — Pase MCDD → Pase MCDI → Desmarque MCDD → Pase SD → Tiro DC
 3. *build_central* — Pase MCO → Pase MCDD → Desmarque SD → Pase DC → Tiro MVD
 4. *build_paciente* — Pase MCDI → Pase MVD → Pase MCDD → Desmarque SD → Tiro DC
 5. *build_paciente* — Pase MCO → Pase MVD → Pase MCO → Desmarque DC → Tiro SD
 6. *build_paciente* — Pase MCDD → Pase MVD → Pase MCDI → Desmarque SD → Tiro MVD
 7. *switch_play* — Pase MCDI → Pase MVI → Regate MVD → Pase MCDD → Remate SD
 8. *switch_play* — Pase MCDD → Pase MVI → Regate MVD → Pase MVI → Remate DC
 9. *switch_play* — Pase MCO → Pase MVI → Regate MVD → Pase MCDI → Remate MVD
10. *wing_overlap* — Pase MCDI → Regate MVD → Pase DFD → Pase MVD → Remate DC
11. *wing_overlap* — Pase MCDD → Regate MVD → Pase DFD → Pase MVD → Remate SD
12. *wing_cutback* — Pase MVD → Regate MVD → Desmarque MCDD → Pase MVD → Tiro DC
13. *wing_cutback* — Pase MVD → Regate MVD → Desmarque MCO → Pase MVD → Tiro SD
14. *through_ball* — Pase MCDD → Pase MCDI → Desmarque MCDD → Desmarque SD → Tiro DC
15. *through_ball* — Pase DFC → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro SD
16. *through_ball* — Pase MCDI → Pase MCO → Desmarque MCDD → Desmarque SD → Tiro MVD
17. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCO → Pase DC → Tiro SD
18. *give_and_go* — Pase MCO → Pase SD → Desmarque MCDI → Pase SD → Tiro DC
19. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCDD → Pase DC → Tiro MVD
20. *counter* — Pase MCDI → Regate MVD → Pase MCO → Desmarque SD → Tiro DC
21. *counter* — Pase MCO → Regate MVD → Pase MCDI → Desmarque DC → Tiro SD
22. *long_ball* — Pase DFC → Desmarque SD → Pase DC → Desmarque SD → Remate DC
23. *long_ball* — Pase DFC → Desmarque DC → Pase SD → Desmarque DC → Remate SD
24. *long_shot* — Pase MCO → Regate MCDD → Tiro DC
25. *long_shot* — Pase MCO → Regate MCDD → Tiro SD
26. *long_shot* — Pase MCO → Regate MCDD → Tiro MVD
27. *solo_run* — Regate MVD → Regate MVD → Regate SD → Tiro DC
28. *solo_run* — Regate MVD → Regate MVD → Regate SD → Tiro DC
29. *overload* — Pase MVD → Desmarque DFD → Pase MCDD → Desmarque DC → Remate SD
30. *overload* — Pase MVD → Desmarque DFD → Pase MCO → Desmarque SD → Remate DC
31. *third_man* — Pase DFC → Pase MCDD → Pase MVD → Desmarque DC → Tiro SD
32. *third_man* — Pase MCDI → Pase MCO → Pase MVD → Desmarque SD → Tiro DC
33. *third_man* — Pase MCO → Pase MCDD → Pase MVD → Desmarque DC → Tiro MVD
34. *carrilero_run* — Pase MCDD → Desmarque MVD → Pase MCDI → Remate SD
35. *carrilero_run* — Pase MCDD → Desmarque MVD → Pase MCDI → Remate SD

## metodo-2-3-2-3
*105 jugadas de campo · izquierda 35 · centro 35 · derecha 35*

**Dibujo (posiciones de campo):** Defensa: DFI · DFC  |  Mediocampo: MCDI · MCD · MCDD · MCO · SD  |  Ataque: SDI · DC · SDD

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×45, Pase ×24, Tiro ×16, Remate ×13, Regate ×4 · ⚽×29
- **SD** (Segundo delantero): Pase ×48, Regate ×15, Desmarque ×13, Tiro ×5, Remate ×1 · ⚽×6
- **MCD** (Pivote): Pase ×50, Desmarque ×10, Remate ×3, Tiro ×2, Regate ×1 · ⚽×5
- **MCO** (Mediapunta): Pase ×51, Desmarque ×4, Regate ×4, Tiro ×2, Remate ×1 · ⚽×3
- **SDD** (Delantero/extremo derecho): Tiro ×16, Remate ×8, Regate ×8, Pase ×7, Desmarque ×6 · ⚽×24
- **SDI** (Delantero/extremo izquierdo): Tiro ×19, Regate ×8, Desmarque ×6, Pase ×6, Remate ×5 · ⚽×24
- **MCDD** (Pivote derecho): Pase ×17, Regate ×7, Tiro ×6, Desmarque ×3, Remate ×1 · ⚽×7
- **MCDI** (Pivote izquierdo): Pase ×16, Regate ×7, Tiro ×6, Desmarque ×3, Remate ×1 · ⚽×7
- **DFC** (Central): Pase ×18, Desmarque ×3
- **DFI** (Central izquierdo): Pase ×3, Desmarque ×3

### metodo-2-3-2-3 · ataque por izquierda (35 jugadas)

 1. *build_central* — Pase MCD → Pase SD → Desmarque DC → Pase SDD → Tiro DC
 2. *build_central* — Pase SD → Pase MCD → Desmarque SD → Pase DC → Tiro SDI
 3. *build_central* — Pase MCO → Pase SD → Desmarque MCD → Pase DC → Tiro MCDI
 4. *build_paciente* — Pase SD → Pase MCDI → Pase SD → Desmarque SDI → Tiro DC
 5. *build_paciente* — Pase DFC → Pase MCDI → Pase MCO → Desmarque SDI → Tiro DC
 6. *build_paciente* — Pase MCD → Pase MCDI → Pase MCD → Desmarque SDI → Tiro MCDI
 7. *switch_play* — Pase MCD → Pase MCDD → Regate MCDI → Pase MCDD → Remate DC
 8. *switch_play* — Pase SD → Pase MCDD → Regate SDI → Pase MCDI → Remate SDI
 9. *switch_play* — Pase MCO → Pase MCDD → Regate MCDI → Pase SD → Remate MCDI
10. *wing_overlap* — Pase MCD → Regate MCDI → Pase DFI → Pase MCDI → Remate DC
11. *wing_overlap* — Pase SD → Regate SDI → Pase DFI → Pase SDI → Remate DC
12. *wing_cutback* — Pase MCDI → Regate MCDI → Desmarque SDI → Pase MCDI → Tiro DC
13. *wing_cutback* — Pase MCDI → Regate SDI → Desmarque MCDI → Pase SDI → Tiro DC
14. *through_ball* — Pase MCD → Pase MCO → Desmarque SD → Desmarque DC → Tiro SDD
15. *through_ball* — Pase MCO → Pase SD → Desmarque MCD → Desmarque DC → Tiro SDI
16. *through_ball* — Pase SD → Pase MCD → Desmarque SD → Desmarque DC → Tiro MCDI
17. *give_and_go* — Pase SD → Pase DC → Desmarque MCO → Pase DC → Tiro SDI
18. *give_and_go* — Pase MCO → Pase DC → Desmarque MCD → Pase DC → Tiro SDI
19. *give_and_go* — Pase MCD → Pase DC → Desmarque SD → Pase DC → Tiro MCDI
20. *counter* — Pase SD → Regate MCDI → Pase MCO → Desmarque DC → Tiro SDD
21. *counter* — Pase DFC → Regate SDI → Pase MCD → Desmarque DC → Tiro SDI
22. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
23. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate SDI
24. *long_shot* — Pase MCO → Regate SD → Tiro DC
25. *long_shot* — Pase MCO → Regate SD → Tiro SDI
26. *long_shot* — Pase MCO → Regate SD → Tiro MCDI
27. *solo_run* — Regate MCDI → Regate SDI → Regate SDI → Tiro DC
28. *solo_run* — Regate MCDI → Regate SDI → Regate SDI → Tiro SDD
29. *overload* — Pase MCDI → Desmarque DFI → Pase SD → Desmarque SDI → Remate DC
30. *overload* — Pase MCDI → Desmarque DFI → Pase MCO → Desmarque SDI → Remate SDD
31. *third_man* — Pase MCO → Pase SD → Pase MCDI → Desmarque DC → Tiro SDI
32. *third_man* — Pase SD → Pase MCD → Pase MCDI → Desmarque DC → Tiro SDI
33. *third_man* — Pase DFC → Pase MCD → Pase MCDI → Desmarque DC → Tiro MCDI
34. *carrilero_run* — Pase MCD → Desmarque MCDI → Pase SD → Remate DC
35. *carrilero_run* — Pase MCD → Desmarque MCDI → Pase SD → Remate SDI

### metodo-2-3-2-3 · ataque por centro (35 jugadas)

 1. *build_central* — Pase MCD → Pase MCO → Desmarque DC → Pase SDI → Tiro DC
 2. *build_central* — Pase SD → Pase MCO → Desmarque SD → Pase DC → Tiro MCD
 3. *build_central* — Pase MCO → Pase MCD → Desmarque MCO → Pase DC → Tiro SDD
 4. *build_paciente* — Pase DFC → Pase MCO → Pase MCD → Desmarque DC → Tiro SDI
 5. *build_paciente* — Pase MCD → Pase MCO → Pase SD → Desmarque DC → Tiro MCD
 6. *build_paciente* — Pase MCO → Pase SD → Pase MCD → Desmarque DC → Tiro SDI
 7. *switch_play* — Pase MCD → Pase MCO → Regate MCO → Pase MCD → Remate DC
 8. *switch_play* — Pase SD → Pase MCO → Regate SD → Pase MCO → Remate MCD
 9. *switch_play* — Pase MCO → Pase MCD → Regate DC → Pase MCO → Remate SDD
10. *wing_overlap* — Pase MCD → Regate DC → Pase DFC → Pase MCO → Remate DC
11. *wing_overlap* — Pase SD → Regate MCD → Pase DFC → Pase SD → Remate MCO
12. *wing_cutback* — Pase MCO → Regate MCO → Desmarque MCD → Pase SD → Tiro DC
13. *wing_cutback* — Pase MCD → Regate SD → Desmarque DC → Pase MCD → Tiro SD
14. *through_ball* — Pase MCO → Pase SD → Desmarque MCD → Desmarque DC → Tiro SDI
15. *through_ball* — Pase SD → Pase MCD → Desmarque SD → Desmarque DC → Tiro SD
16. *through_ball* — Pase DFC → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SDI
17. *give_and_go* — Pase SD → Pase DC → Desmarque MCO → Pase DC → Tiro SDD
18. *give_and_go* — Pase MCO → Pase DC → Desmarque MCD → Pase DC → Tiro SD
19. *give_and_go* — Pase MCD → Pase DC → Desmarque SD → Pase DC → Tiro SDD
20. *counter* — Pase DFC → Regate MCO → Pase MCD → Desmarque DC → Tiro SDI
21. *counter* — Pase MCD → Regate SD → Pase MCO → Desmarque DC → Tiro SD
22. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate SDI
23. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate MCD
24. *long_shot* — Pase MCO → Regate SD → Tiro DC
25. *long_shot* — Pase MCO → Regate SD → Tiro MCO
26. *long_shot* — Pase MCO → Regate SD → Tiro SDI
27. *solo_run* — Regate MCO → Regate SD → Regate DC → Tiro SDI
28. *solo_run* — Regate SD → Regate SD → Regate DC → Tiro SD
29. *overload* — Pase MCD → Desmarque DFC → Pase SD → Desmarque DC → Remate SDD
30. *overload* — Pase SD → Desmarque DFC → Pase MCO → Desmarque DC → Remate MCD
31. *third_man* — Pase SD → Pase MCD → Pase SD → Desmarque DC → Tiro SDD
32. *third_man* — Pase DFC → Pase MCO → Pase MCD → Desmarque DC → Tiro MCO
33. *third_man* — Pase MCD → Pase MCO → Pase SD → Desmarque DC → Tiro SDD
34. *carrilero_run* — Pase MCO → Desmarque SD → Pase MCD → Remate DC
35. *carrilero_run* — Pase MCO → Desmarque SD → Pase MCD → Remate SD

### metodo-2-3-2-3 · ataque por derecha (35 jugadas)

 1. *build_central* — Pase MCD → Pase SD → Desmarque DC → Pase SDD → Tiro DC
 2. *build_central* — Pase SD → Pase MCD → Desmarque SD → Pase DC → Tiro SDD
 3. *build_central* — Pase MCO → Pase SD → Desmarque MCD → Pase DC → Tiro MCDD
 4. *build_paciente* — Pase MCD → Pase MCDD → Pase SD → Desmarque SDD → Tiro DC
 5. *build_paciente* — Pase MCO → Pase MCDD → Pase MCO → Desmarque SDD → Tiro SDI
 6. *build_paciente* — Pase SD → Pase MCDD → Pase MCD → Desmarque SDD → Tiro MCDD
 7. *switch_play* — Pase MCD → Pase MCDI → Regate MCDD → Pase SD → Remate DC
 8. *switch_play* — Pase SD → Pase MCDI → Regate SDD → Pase MCDD → Remate SDD
 9. *switch_play* — Pase MCO → Pase MCDI → Regate MCDD → Pase MCD → Remate MCDD
10. *wing_overlap* — Pase MCD → Regate MCDD → Pase DFC → Pase MCDD → Remate DC
11. *wing_overlap* — Pase SD → Regate SDD → Pase DFI → Pase SDD → Remate SDI
12. *wing_cutback* — Pase MCDD → Regate MCDD → Desmarque SDD → Pase MCDD → Tiro DC
13. *wing_cutback* — Pase MCDD → Regate SDD → Desmarque MCDD → Pase SDD → Tiro SDI
14. *through_ball* — Pase SD → Pase MCD → Desmarque SD → Desmarque DC → Tiro SDD
15. *through_ball* — Pase DFC → Pase SD → Desmarque MCD → Desmarque DC → Tiro SDD
16. *through_ball* — Pase MCD → Pase MCO → Desmarque SD → Desmarque DC → Tiro MCDD
17. *give_and_go* — Pase SD → Pase DC → Desmarque MCO → Pase DC → Tiro SDI
18. *give_and_go* — Pase MCO → Pase DC → Desmarque MCD → Pase DC → Tiro SDD
19. *give_and_go* — Pase MCD → Pase DC → Desmarque SD → Pase DC → Tiro MCDD
20. *counter* — Pase MCD → Regate MCDD → Pase MCO → Desmarque DC → Tiro SDD
21. *counter* — Pase MCO → Regate SDD → Pase MCD → Desmarque DC → Tiro SDD
22. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
23. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate SDD
24. *long_shot* — Pase MCO → Regate SD → Tiro DC
25. *long_shot* — Pase MCO → Regate SD → Tiro SDD
26. *long_shot* — Pase MCO → Regate SD → Tiro MCDD
27. *solo_run* — Regate MCDD → Regate SDD → Regate SDD → Tiro DC
28. *solo_run* — Regate MCDD → Regate SDD → Regate SDD → Tiro DC
29. *overload* — Pase MCDD → Desmarque DFC → Pase SD → Desmarque SDD → Remate DC
30. *overload* — Pase MCDD → Desmarque DFI → Pase MCO → Desmarque SDD → Remate DC
31. *third_man* — Pase DFC → Pase SD → Pase MCDD → Desmarque DC → Tiro SDI
32. *third_man* — Pase MCD → Pase MCO → Pase MCDD → Desmarque DC → Tiro SDD
33. *third_man* — Pase MCO → Pase SD → Pase MCDD → Desmarque DC → Tiro MCDD
34. *carrilero_run* — Pase SD → Desmarque MCDD → Pase MCD → Remate DC
35. *carrilero_run* — Pase SD → Desmarque MCDD → Pase MCD → Remate SDD

## 3-2-4-1
*111 jugadas de campo · izquierda 37 · centro 37 · derecha 37*

**Dibujo (posiciones de campo):** Defensa: DFI · DFC · DFD  |  Mediocampo: MCDI · MCDD · MCO · MCO2 · MCO3 · MCO4  |  Ataque: DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×53, Tiro ×50, Pase ×37, Remate ×29, Regate ×10 · ⚽×79
- **MCO2** (Mediapunta): Pase ×42, Regate ×8, Desmarque ×7, Tiro ×4, Remate ×2 · ⚽×6
- **MCO** (Mediapunta): Pase ×37, Regate ×10, Desmarque ×6, Tiro ×4, Remate ×2 · ⚽×6
- **MCO3** (Mediapunta): Pase ×40, Regate ×9, Desmarque ×6, Remate ×1, Tiro ×1 · ⚽×2
- **MCDD** (Pivote derecho): Pase ×29, Desmarque ×7, Regate ×6, Remate ×3, Tiro ×2 · ⚽×5
- **MCO4** (Mediapunta): Pase ×26, Desmarque ×8, Regate ×7, Tiro ×4, Remate ×2 · ⚽×6
- **MCDI** (Pivote izquierdo): Pase ×26, Regate ×7, Desmarque ×6, Tiro ×4, Remate ×3 · ⚽×7
- **DFC** (Central): Pase ×15, Desmarque ×3
- **DFD** (Central derecho): Pase ×3, Desmarque ×3
- **DFI** (Central izquierdo): Pase ×3, Desmarque ×3

### 3-2-4-1 · ataque por izquierda (37 jugadas)

 1. *build_central* — Pase MCDI → Pase MCO → Desmarque MCO2 → Pase DC → Tiro DC
 2. *build_central* — Pase MCO4 → Pase MCDD → Desmarque MCO → Pase DC → Tiro DC
 3. *build_central* — Pase MCO3 → Pase MCDD → Desmarque MCDI → Pase DC → Tiro MCO
 4. *build_paciente* — Pase MCDI → Pase MCO → Pase MCO2 → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase MCO4 → Pase MCDD → Pase MCO2 → Desmarque DC → Tiro DC
 6. *build_paciente* — Pase MCO2 → Pase MCDD → Pase MCO2 → Desmarque DC → Tiro MCO4
 7. *switch_play* — Pase MCDI → Pase MCO → Regate MCO3 → Pase MCO2 → Remate DC
 8. *switch_play* — Pase MCO4 → Pase MCDD → Regate MCO → Pase MCO3 → Remate DC
 9. *switch_play* — Pase MCO3 → Pase MCDD → Regate MCDI → Pase MCO3 → Remate MCO4
10. *wing_overlap* — Pase MCO2 → Regate MCO3 → Pase DFI → Pase DC → Remate DC
11. *wing_overlap* — Pase MCO → Regate MCO → Pase DFI → Pase MCO3 → Remate DC
12. *wing_overlap* — Pase MCDD → Regate MCDI → Pase DFI → Pase MCO → Remate MCO4
13. *wing_cutback* — Pase MCDI → Regate MCO4 → Desmarque MCO → Pase MCO3 → Tiro DC
14. *wing_cutback* — Pase MCO4 → Regate MCO2 → Desmarque MCDD → Pase MCO2 → Tiro DC
15. *wing_cutback* — Pase MCO3 → Regate MCDD → Desmarque MCDI → Pase MCO → Tiro MCO4
16. *through_ball* — Pase MCO3 → Pase MCDD → Desmarque MCO2 → Desmarque DC → Tiro DC
17. *through_ball* — Pase MCO → Pase MCDD → Desmarque MCO2 → Desmarque DC → Tiro DC
18. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCO2 → Pase DC → Tiro DC
19. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCO → Pase DC → Tiro DC
20. *give_and_go* — Pase MCO4 → Pase DC → Desmarque MCDD → Pase DC → Tiro MCO2
21. *counter* — Pase MCDD → Regate MCO2 → Pase MCO → Desmarque DC → Tiro DC
22. *counter* — Pase DFC → Regate MCDD → Pase MCO2 → Desmarque DC → Tiro DC
23. *long_ball* — Pase DFC → Desmarque DC → Pase DC → Desmarque DC → Remate DC
24. *long_ball* — Pase DFC → Desmarque DC → Pase DC → Desmarque DC → Remate DC
25. *long_shot* — Pase MCDI → Regate MCDD → Tiro DC
26. *long_shot* — Pase MCO2 → Regate MCO3 → Tiro DC
27. *solo_run* — Regate MCDI → Regate MCDD → Regate DC → Tiro DC
28. *solo_run* — Regate MCO3 → Regate MCO4 → Regate DC → Tiro DC
29. *overload* — Pase MCO → Desmarque DFI → Pase MCO3 → Desmarque DC → Remate DC
30. *overload* — Pase MCDD → Desmarque DFI → Pase MCO2 → Desmarque DC → Remate DC
31. *overload* — Pase MCDI → Desmarque DFI → Pase MCO → Desmarque DC → Remate MCO3
32. *third_man* — Pase MCDD → Pase MCDI → Pase MCO → Desmarque DC → Tiro DC
33. *third_man* — Pase DFC → Pase MCO4 → Pase MCDD → Desmarque DC → Tiro DC
34. *third_man* — Pase MCO3 → Pase MCDI → Pase MCO → Desmarque DC → Tiro MCDD
35. *carrilero_run* — Pase MCO → Desmarque MCDI → Pase MCO → Remate DC
36. *carrilero_run* — Pase DFC → Desmarque MCDD → Pase MCDI → Remate DC
37. *carrilero_run* — Pase MCO2 → Desmarque MCO3 → Pase MCO4 → Remate MCDI

### 3-2-4-1 · ataque por centro (37 jugadas)

 1. *build_central* — Pase MCO → Pase MCO2 → Desmarque MCO4 → Pase DC → Tiro DC
 2. *build_central* — Pase MCDD → Pase MCO2 → Desmarque MCO3 → Pase DC → Tiro MCO4
 3. *build_central* — Pase MCDI → Pase MCO2 → Desmarque MCO → Pase DC → Tiro DC
 4. *build_paciente* — Pase MCDD → Pase MCO2 → Pase MCO3 → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase DFC → Pase MCO4 → Pase MCO2 → Desmarque DC → Tiro MCO
 6. *build_paciente* — Pase MCO3 → Pase MCO → Pase MCO3 → Desmarque DC → Tiro DC
 7. *switch_play* — Pase MCO → Pase MCO2 → Regate MCO4 → Pase MCO3 → Remate DC
 8. *switch_play* — Pase MCDD → Pase MCO2 → Regate MCO2 → Pase MCO4 → Remate MCDI
 9. *switch_play* — Pase MCDI → Pase MCO2 → Regate MCDD → Pase MCO4 → Remate DC
10. *wing_overlap* — Pase MCO4 → Regate MCO4 → Pase DFC → Pase MCDI → Remate DC
11. *wing_overlap* — Pase MCO3 → Regate MCO2 → Pase DFC → Pase MCO4 → Remate MCDI
12. *wing_overlap* — Pase MCO2 → Regate MCDD → Pase DFC → Pase MCO2 → Remate DC
13. *wing_cutback* — Pase MCO → Regate DC → Desmarque MCO3 → Pase DC → Tiro DC
14. *wing_cutback* — Pase MCDD → Regate MCO3 → Desmarque MCO2 → Pase MCO4 → Tiro MCDI
15. *wing_cutback* — Pase MCDI → Regate MCO → Desmarque MCO2 → Pase MCO3 → Tiro DC
16. *through_ball* — Pase MCO4 → Pase MCO → Desmarque MCO3 → Desmarque DC → Tiro DC
17. *through_ball* — Pase MCO2 → Pase MCO → Desmarque MCO3 → Desmarque DC → Tiro MCO
18. *give_and_go* — Pase MCO2 → Pase DC → Desmarque MCO4 → Pase DC → Tiro DC
19. *give_and_go* — Pase MCO → Pase DC → Desmarque MCO3 → Pase DC → Tiro MCDI
20. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCO2 → Pase DC → Tiro DC
21. *counter* — Pase MCO → Regate MCO3 → Pase MCO2 → Desmarque DC → Tiro DC
22. *counter* — Pase MCDI → Regate MCO → Pase MCO3 → Desmarque DC → Tiro MCO2
23. *long_ball* — Pase DFC → Desmarque DC → Pase DC → Desmarque DC → Remate DC
24. *long_ball* — Pase DFC → Desmarque DC → Pase DC → Desmarque DC → Remate MCDD
25. *long_shot* — Pase MCO → Regate MCO2 → Tiro DC
26. *long_shot* — Pase MCO4 → Regate MCDI → Tiro MCO
27. *solo_run* — Regate MCO → Regate MCO → Regate DC → Tiro DC
28. *solo_run* — Regate MCDI → Regate DC → Regate DC → Tiro MCO2
29. *overload* — Pase MCO3 → Desmarque DFC → Pase MCDI → Desmarque DC → Remate DC
30. *overload* — Pase MCO2 → Desmarque DFC → Pase MCO4 → Desmarque DC → Remate MCDD
31. *overload* — Pase MCO → Desmarque DFC → Pase MCO3 → Desmarque DC → Remate DC
32. *third_man* — Pase MCO → Pase MCDD → Pase MCO2 → Desmarque DC → Tiro DC
33. *third_man* — Pase MCDI → Pase MCO → Pase MCO2 → Desmarque DC → Tiro MCO3
34. *third_man* — Pase MCO4 → Pase MCDD → Pase MCO2 → Desmarque DC → Tiro DC
35. *carrilero_run* — Pase MCO2 → Desmarque MCDD → Pase MCO2 → Remate DC
36. *carrilero_run* — Pase MCDI → Desmarque MCDD → Pase MCO → Remate MCO2
37. *carrilero_run* — Pase MCO3 → Desmarque MCO4 → Pase MCDI → Remate DC

### 3-2-4-1 · ataque por derecha (37 jugadas)

 1. *build_central* — Pase MCO3 → Pase MCO2 → Desmarque MCDI → Pase DC → Tiro DC
 2. *build_central* — Pase MCO2 → Pase MCO3 → Desmarque DC → Pase DC → Tiro DC
 3. *build_central* — Pase MCO → Pase MCO3 → Desmarque MCO4 → Pase DC → Tiro MCDI
 4. *build_paciente* — Pase MCO → Pase MCO3 → Pase MCO4 → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase MCDI → Pase MCO3 → Pase MCO4 → Desmarque DC → Tiro DC
 6. *build_paciente* — Pase MCO4 → Pase MCO2 → Pase MCO4 → Desmarque DC → Tiro MCO2
 7. *switch_play* — Pase MCO3 → Pase MCO2 → Regate DC → Pase MCDD → Remate DC
 8. *switch_play* — Pase MCO2 → Pase MCO3 → Regate MCO3 → Pase MCDI → Remate DC
 9. *switch_play* — Pase MCO → Pase MCO3 → Regate MCO → Pase MCDI → Remate MCO
10. *wing_overlap* — Pase MCDD → Regate DC → Pase DFD → Pase MCDD → Remate DC
11. *wing_overlap* — Pase MCDI → Regate MCO3 → Pase DFD → Pase DC → Remate DC
12. *wing_overlap* — Pase MCO4 → Regate MCO → Pase DFD → Pase MCO3 → Remate MCDD
13. *wing_cutback* — Pase MCO3 → Regate MCDI → Desmarque MCDD → Pase MCO → Tiro DC
14. *wing_cutback* — Pase MCO2 → Regate MCO4 → Desmarque DC → Pase MCDI → Tiro DC
15. *wing_cutback* — Pase MCO → Regate MCO2 → Desmarque MCO4 → Pase DC → Tiro MCDI
16. *through_ball* — Pase DFC → Pase MCO → Desmarque MCO4 → Desmarque DC → Tiro DC
17. *through_ball* — Pase MCO3 → Pase MCO2 → Desmarque MCO4 → Desmarque DC → Tiro DC
18. *give_and_go* — Pase MCO4 → Pase DC → Desmarque MCDD → Pase DC → Tiro DC
19. *give_and_go* — Pase MCO3 → Pase DC → Desmarque MCDI → Pase DC → Tiro DC
20. *give_and_go* — Pase MCO2 → Pase DC → Desmarque MCO4 → Pase DC → Tiro MCDD
21. *counter* — Pase MCO2 → Regate MCO4 → Pase MCO3 → Desmarque DC → Tiro DC
22. *counter* — Pase MCDD → Regate MCO2 → Pase MCO4 → Desmarque DC → Tiro DC
23. *long_ball* — Pase DFC → Desmarque DC → Pase DC → Desmarque DC → Remate DC
24. *long_ball* — Pase DFC → Desmarque DC → Pase DC → Desmarque DC → Remate DC
25. *long_shot* — Pase MCO3 → Regate MCO4 → Tiro DC
26. *long_shot* — Pase MCDD → Regate MCO → Tiro DC
27. *solo_run* — Regate MCO3 → Regate MCO2 → Regate DC → Tiro DC
28. *solo_run* — Regate MCO → Regate MCDI → Regate DC → Tiro DC
29. *overload* — Pase MCDI → Desmarque DFD → Pase MCO → Desmarque DC → Remate DC
30. *overload* — Pase MCO4 → Desmarque DFD → Pase MCDD → Desmarque DC → Remate DC
31. *overload* — Pase MCO3 → Desmarque DFD → Pase MCDI → Desmarque DC → Remate MCO
32. *third_man* — Pase MCO2 → Pase MCO → Pase MCO3 → Desmarque DC → Tiro DC
33. *third_man* — Pase MCDD → Pase MCO2 → Pase MCO3 → Desmarque DC → Tiro DC
34. *third_man* — Pase DFC → Pase MCO → Pase MCO3 → Desmarque DC → Tiro MCO4
35. *carrilero_run* — Pase MCO3 → Desmarque MCO → Pase MCO3 → Remate DC
36. *carrilero_run* — Pase MCDD → Desmarque MCO → Pase MCO2 → Remate DC
37. *carrilero_run* — Pase MCO4 → Desmarque MCDI → Pase MCO → Remate MCO2

## 3-2-3-2
*105 jugadas de campo · izquierda 35 · centro 35 · derecha 35*

**Dibujo (posiciones de campo):** Defensa: DFI · DFC · DFD  |  Mediocampo: MCDI · MCDD · MI · MCO · MD  |  Ataque: SD · DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×28, Tiro ×26, Pase ×19, Remate ×13, Regate ×3 · ⚽×39
- **SD** (Segundo delantero): Desmarque ×29, Tiro ×25, Pase ×17, Remate ×13, Regate ×4 · ⚽×38
- **MCO** (Mediapunta): Pase ×45, Desmarque ×14, Regate ×13, Tiro ×5, Remate ×1 · ⚽×6
- **MCDI** (Pivote izquierdo): Pase ×49, Desmarque ×10, Remate ×4, Tiro ×2, Regate ×1 · ⚽×6
- **MCDD** (Pivote derecho): Pase ×52, Regate ×7, Desmarque ×3, Tiro ×2 · ⚽×2
- **MD** (Medio derecho): Pase ×20, Regate ×13, Tiro ×6, Desmarque ×3, Remate ×1 · ⚽×7
- **MI** (Medio izquierdo): Pase ×17, Regate ×13, Tiro ×6, Desmarque ×3, Remate ×1 · ⚽×7
- **DFC** (Central): Pase ×17, Desmarque ×2
- **DFD** (Central derecho): Pase ×2, Desmarque ×2
- **DFI** (Central izquierdo): Pase ×2, Desmarque ×2

### 3-2-3-2 · ataque por izquierda (35 jugadas)

 1. *build_central* — Pase MCDI → Pase MCO → Desmarque SD → Pase DC → Tiro SD
 2. *build_central* — Pase MCO → Pase MCDI → Desmarque DC → Pase SD → Tiro DC
 3. *build_central* — Pase MCDD → Pase MCO → Desmarque MCDI → Pase DC → Tiro MI
 4. *build_paciente* — Pase MCO → Pase MI → Pase MCO → Desmarque SD → Tiro DC
 5. *build_paciente* — Pase DFC → Pase MI → Pase MCDD → Desmarque DC → Tiro SD
 6. *build_paciente* — Pase MCDI → Pase MI → Pase MCDI → Desmarque SD → Tiro MI
 7. *switch_play* — Pase MCDI → Pase MD → Regate MI → Pase MCDD → Remate SD
 8. *switch_play* — Pase MCO → Pase MD → Regate MI → Pase MCO → Remate DC
 9. *switch_play* — Pase MCDD → Pase MD → Regate MI → Pase MD → Remate MI
10. *wing_overlap* — Pase MCDI → Regate MI → Pase DFI → Pase MI → Remate DC
11. *wing_overlap* — Pase MCO → Regate MI → Pase DFI → Pase MI → Remate SD
12. *wing_cutback* — Pase MI → Regate MI → Desmarque MD → Pase MI → Tiro DC
13. *wing_cutback* — Pase MI → Regate MI → Desmarque MCO → Pase MI → Tiro SD
14. *through_ball* — Pase MCDI → Pase MCDD → Desmarque MCO → Desmarque SD → Tiro DC
15. *through_ball* — Pase MCDD → Pase MCO → Desmarque MCDI → Desmarque DC → Tiro SD
16. *through_ball* — Pase MCO → Pase MCDI → Desmarque MCO → Desmarque SD → Tiro MI
17. *give_and_go* — Pase MCO → Pase DC → Desmarque MCDD → Pase DC → Tiro SD
18. *give_and_go* — Pase MCDD → Pase SD → Desmarque MCDI → Pase SD → Tiro DC
19. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCO → Pase DC → Tiro MI
20. *counter* — Pase MCO → Regate MI → Pase MCDD → Desmarque SD → Tiro DC
21. *counter* — Pase DFC → Regate MI → Pase MCDI → Desmarque DC → Tiro SD
22. *long_ball* — Pase DFC → Desmarque SD → Pase DC → Desmarque SD → Remate DC
23. *long_ball* — Pase DFC → Desmarque DC → Pase SD → Desmarque DC → Remate SD
24. *long_shot* — Pase MCDD → Regate MCO → Tiro DC
25. *long_shot* — Pase MCDD → Regate MCO → Tiro SD
26. *long_shot* — Pase MCDD → Regate MCO → Tiro MI
27. *solo_run* — Regate MI → Regate MI → Regate SD → Tiro DC
28. *solo_run* — Regate MI → Regate MI → Regate SD → Tiro DC
29. *overload* — Pase MI → Desmarque DFI → Pase MCO → Desmarque DC → Remate SD
30. *overload* — Pase MI → Desmarque DFI → Pase MCDD → Desmarque SD → Remate DC
31. *third_man* — Pase MCDD → Pase MCO → Pase MI → Desmarque DC → Tiro SD
32. *third_man* — Pase MCO → Pase MCDI → Pase MI → Desmarque SD → Tiro DC
33. *third_man* — Pase DFC → Pase MCDI → Pase MI → Desmarque DC → Tiro MI
34. *carrilero_run* — Pase MCDI → Desmarque MI → Pase MD → Remate SD
35. *carrilero_run* — Pase MCDI → Desmarque MI → Pase MD → Remate SD

### 3-2-3-2 · ataque por centro (35 jugadas)

 1. *build_central* — Pase MCDI → Pase MCDD → Desmarque DC → Pase SD → Tiro DC
 2. *build_central* — Pase MCO → Pase MCDD → Desmarque MCDI → Pase DC → Tiro MCDI
 3. *build_central* — Pase MCDD → Pase MCDI → Desmarque MCO → Pase SD → Tiro DC
 4. *build_paciente* — Pase DFC → Pase MCDD → Pase MCDI → Desmarque DC → Tiro SD
 5. *build_paciente* — Pase MCDI → Pase MCDD → Pase MCO → Desmarque SD → Tiro MCDI
 6. *build_paciente* — Pase MCDD → Pase MCO → Pase MCDI → Desmarque DC → Tiro SD
 7. *switch_play* — Pase MCDI → Pase MCDD → Regate MCO → Pase MCDI → Remate DC
 8. *switch_play* — Pase MCO → Pase MCDD → Regate MCO → Pase MCDD → Remate MCDI
 9. *switch_play* — Pase MCDD → Pase MCDI → Regate MCO → Pase MCDI → Remate DC
10. *wing_overlap* — Pase MCDI → Regate MCDD → Pase DFC → Pase SD → Remate DC
11. *wing_overlap* — Pase MCO → Regate MCDD → Pase DFC → Pase SD → Remate MCDI
12. *wing_cutback* — Pase MCDD → Regate MCDD → Desmarque SD → Pase DC → Tiro SD
13. *wing_cutback* — Pase MCDI → Regate MCDD → Desmarque DC → Pase MCDI → Tiro MCO
14. *through_ball* — Pase MCDD → Pase MCO → Desmarque MCDI → Desmarque DC → Tiro SD
15. *through_ball* — Pase MCO → Pase MCDI → Desmarque MCO → Desmarque SD → Tiro MCO
16. *through_ball* — Pase DFC → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro SD
17. *give_and_go* — Pase MCO → Pase SD → Desmarque MCDD → Pase SD → Tiro DC
18. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCDI → Pase DC → Tiro MCO
19. *give_and_go* — Pase MCDI → Pase SD → Desmarque MCO → Pase SD → Tiro DC
20. *counter* — Pase DFC → Regate MCDD → Pase MCDI → Desmarque DC → Tiro SD
21. *counter* — Pase MCDI → Regate MCDD → Pase MCO → Desmarque SD → Tiro MCO
22. *long_ball* — Pase DFC → Desmarque DC → Pase SD → Desmarque DC → Remate SD
23. *long_ball* — Pase DFC → Desmarque SD → Pase DC → Desmarque SD → Remate MCDI
24. *long_shot* — Pase MCDD → Regate MCO → Tiro SD
25. *long_shot* — Pase MCDD → Regate MCO → Tiro MCDD
26. *long_shot* — Pase MCDD → Regate MCO → Tiro SD
27. *solo_run* — Regate MCDD → Regate MCDI → Regate DC → Tiro SD
28. *solo_run* — Regate MCO → Regate DC → Regate DC → Tiro MCO
29. *overload* — Pase MCDI → Desmarque DFC → Pase MCO → Desmarque SD → Remate DC
30. *overload* — Pase MCO → Desmarque DFC → Pase MCDD → Desmarque DC → Remate MCDI
31. *third_man* — Pase MCO → Pase MCDI → Pase MCO → Desmarque SD → Tiro DC
32. *third_man* — Pase DFC → Pase MCDD → Pase MCDI → Desmarque DC → Tiro MCDD
33. *third_man* — Pase MCDI → Pase MCDD → Pase MCO → Desmarque SD → Tiro DC
34. *carrilero_run* — Pase MCDD → Desmarque MCO → Pase MCDI → Remate DC
35. *carrilero_run* — Pase MCDD → Desmarque MCO → Pase MCDI → Remate MCO

### 3-2-3-2 · ataque por derecha (35 jugadas)

 1. *build_central* — Pase MCDI → Pase MCO → Desmarque MCDI → Pase DC → Tiro SD
 2. *build_central* — Pase MCO → Pase MCDI → Desmarque MCO → Pase SD → Tiro DC
 3. *build_central* — Pase MCDD → Pase MCO → Desmarque SD → Pase DC → Tiro MD
 4. *build_paciente* — Pase MCDI → Pase MD → Pase MCO → Desmarque SD → Tiro DC
 5. *build_paciente* — Pase MCDD → Pase MD → Pase MCDD → Desmarque DC → Tiro SD
 6. *build_paciente* — Pase MCO → Pase MD → Pase MCDI → Desmarque SD → Tiro MD
 7. *switch_play* — Pase MCDI → Pase MI → Regate MD → Pase MCO → Remate SD
 8. *switch_play* — Pase MCO → Pase MI → Regate MD → Pase MCDI → Remate DC
 9. *switch_play* — Pase MCDD → Pase MI → Regate MD → Pase MCDD → Remate MD
10. *wing_overlap* — Pase MCDI → Regate MD → Pase DFD → Pase MD → Remate DC
11. *wing_overlap* — Pase MCO → Regate MD → Pase DFD → Pase MD → Remate SD
12. *wing_cutback* — Pase MD → Regate MD → Desmarque MCO → Pase MD → Tiro DC
13. *wing_cutback* — Pase MD → Regate MD → Desmarque MI → Pase MD → Tiro SD
14. *through_ball* — Pase MCO → Pase MCDI → Desmarque MCO → Desmarque SD → Tiro DC
15. *through_ball* — Pase DFC → Pase MCO → Desmarque MCDI → Desmarque DC → Tiro SD
16. *through_ball* — Pase MCDI → Pase MCDD → Desmarque MCO → Desmarque SD → Tiro MD
17. *give_and_go* — Pase MCO → Pase DC → Desmarque MCDD → Pase DC → Tiro SD
18. *give_and_go* — Pase MCDD → Pase SD → Desmarque MCDI → Pase SD → Tiro DC
19. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCO → Pase DC → Tiro MD
20. *counter* — Pase MCDI → Regate MD → Pase MCDD → Desmarque SD → Tiro DC
21. *counter* — Pase MCDD → Regate MD → Pase MCDI → Desmarque DC → Tiro SD
22. *long_ball* — Pase DFC → Desmarque SD → Pase DC → Desmarque SD → Remate DC
23. *long_ball* — Pase DFC → Desmarque DC → Pase SD → Desmarque DC → Remate SD
24. *long_shot* — Pase MCDD → Regate MCO → Tiro DC
25. *long_shot* — Pase MCDD → Regate MCO → Tiro SD
26. *long_shot* — Pase MCDD → Regate MCO → Tiro MD
27. *solo_run* — Regate MD → Regate MD → Regate SD → Tiro DC
28. *solo_run* — Regate MD → Regate MD → Regate SD → Tiro DC
29. *overload* — Pase MD → Desmarque DFD → Pase MCO → Desmarque DC → Remate SD
30. *overload* — Pase MD → Desmarque DFD → Pase MCDD → Desmarque SD → Remate DC
31. *third_man* — Pase DFC → Pase MCO → Pase MD → Desmarque DC → Tiro SD
32. *third_man* — Pase MCDI → Pase MCDD → Pase MD → Desmarque SD → Tiro DC
33. *third_man* — Pase MCDD → Pase MCO → Pase MD → Desmarque DC → Tiro MD
34. *carrilero_run* — Pase MCO → Desmarque MD → Pase MCDD → Remate SD
35. *carrilero_run* — Pase MCO → Desmarque MD → Pase MCDD → Remate SD

## 5-3-2
*78 jugadas de campo · izquierda 26 · centro 26 · derecha 26*

**Dibujo (posiciones de campo):** Defensa: LI · DFI · DFC · DFD · LD  |  Mediocampo: MVI · MC · MVD  |  Ataque: SD · DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **MC** (Mediocentro): Pase ×64, Desmarque ×10, Regate ×10, Tiro ×3, Remate ×3 · ⚽×6
- **SD** (Segundo delantero): Desmarque ×27, Tiro ×16, Remate ×14, Pase ×11, Regate ×8 · ⚽×30
- **DC** (Delantero centro): Desmarque ×24, Tiro ×22, Remate ×11, Pase ×9, Regate ×6 · ⚽×33
- **MVI** (Carrilero izquierdo): Pase ×19, Regate ×12, Desmarque ×6, Tiro ×2, Remate ×2 · ⚽×4
- **MVD** (Carrilero derecho): Pase ×18, Regate ×12, Desmarque ×5, Remate ×3, Tiro ×2 · ⚽×5
- **DFD** (Central derecho): Pase ×12, Desmarque ×1
- **DFC** (Central): Pase ×12
- **DFI** (Central izquierdo): Pase ×10, Desmarque ×1
- **LD** (Lateral derecho): Pase ×2, Desmarque ×2
- **LI** (Lateral izquierdo): Pase ×2, Desmarque ×2

### 5-3-2 · ataque por izquierda (26 jugadas)

 1. *build_central* — Pase MC → Pase MVD → Desmarque DC → Pase SD → Tiro DC
 2. *build_paciente* — Pase DFC → Pase MVI → Pase MC → Desmarque SD → Tiro DC
 3. *switch_play* — Pase MC → Pase MVD → Regate MVI → Pase MVD → Remate SD
 4. *wing_overlap* — Pase MC → Regate MVI → Pase LI → Pase MVI → Remate DC
 5. *wing_overlap* — Pase MC → Regate MVI → Pase LI → Pase MVI → Remate SD
 6. *wing_cutback* — Pase MVI → Regate MVI → Desmarque DC → Pase MVI → Tiro DC
 7. *wing_cutback* — Pase MVI → Regate MVI → Desmarque MC → Pase MVI → Tiro SD
 8. *through_ball* — Pase MC → Pase MVI → Desmarque MC → Desmarque SD → Tiro DC
 9. *through_ball* — Pase DFI → Pase MC → Desmarque MVI → Desmarque DC → Tiro SD
10. *give_and_go* — Pase MC → Pase SD → Desmarque MC → Pase SD → Tiro DC
11. *counter* — Pase DFD → Regate MVI → Pase MC → Desmarque DC → Tiro SD
12. *counter* — Pase MC → Regate MVI → Pase MC → Desmarque SD → Tiro DC
13. *counter* — Pase DFI → Regate MVI → Pase MC → Desmarque DC → Tiro MVI
14. *long_ball* — Pase DFD → Desmarque SD → Pase DC → Desmarque SD → Remate DC
15. *long_ball* — Pase DFC → Desmarque DC → Pase SD → Desmarque DC → Remate SD
16. *long_ball* — Pase DFI → Desmarque SD → Pase DC → Desmarque SD → Remate MVI
17. *long_shot* — Pase MC → Regate MC → Tiro SD
18. *long_shot* — Pase MC → Regate MC → Tiro DC
19. *solo_run* — Regate MVI → Regate MVI → Regate SD → Tiro DC
20. *solo_run* — Regate MVI → Regate MVI → Regate SD → Tiro DC
21. *overload* — Pase MVI → Desmarque LI → Pase MC → Desmarque DC → Remate SD
22. *overload* — Pase MVI → Desmarque LI → Pase MC → Desmarque SD → Remate DC
23. *third_man* — Pase DFI → Pase MC → Pase MVI → Desmarque DC → Tiro SD
24. *carrilero_run* — Pase DFC → Desmarque MVI → Pase MVD → Remate SD
25. *carrilero_run* — Pase DFC → Desmarque MVI → Pase MVD → Remate SD
26. *carrilero_run* — Pase DFC → Desmarque MVI → Pase MVD → Remate MVI

### 5-3-2 · ataque por centro (26 jugadas)

 1. *build_central* — Pase MC → Pase MVI → Desmarque MC → Pase SD → Tiro DC
 2. *build_paciente* — Pase DFD → Pase MC → Pase MVI → Desmarque DC → Tiro SD
 3. *switch_play* — Pase MC → Pase MVI → Regate SD → Pase MC → Remate DC
 4. *wing_overlap* — Pase MC → Regate DC → Pase DFI → Pase SD → Remate DC
 5. *wing_overlap* — Pase MC → Regate SD → Pase DFD → Pase MC → Remate MVD
 6. *wing_cutback* — Pase MC → Regate MC → Desmarque SD → Pase DC → Tiro SD
 7. *wing_cutback* — Pase MC → Regate DC → Desmarque SD → Pase MC → Tiro MVD
 8. *through_ball* — Pase DFI → Pase MC → Desmarque MVI → Desmarque DC → Tiro SD
 9. *through_ball* — Pase DFC → Pase MC → Desmarque MVD → Desmarque SD → Tiro MC
10. *give_and_go* — Pase MC → Pase DC → Desmarque MC → Pase DC → Tiro SD
11. *counter* — Pase MC → Regate SD → Pase MC → Desmarque SD → Tiro DC
12. *counter* — Pase DFI → Regate MC → Pase MVI → Desmarque DC → Tiro MC
13. *counter* — Pase DFC → Regate DC → Pase MC → Desmarque SD → Tiro DC
14. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate SD
15. *long_ball* — Pase DFD → Desmarque SD → Pase DC → Desmarque SD → Remate MC
16. *long_ball* — Pase DFC → Desmarque DC → Pase SD → Desmarque DC → Remate SD
17. *long_shot* — Pase MC → Regate MC → Tiro DC
18. *long_shot* — Pase MC → Regate MC → Tiro MVI
19. *solo_run* — Regate MC → Regate SD → Regate DC → Tiro SD
20. *solo_run* — Regate MC → Regate DC → Regate DC → Tiro MC
21. *overload* — Pase MC → Desmarque DFI → Pase MC → Desmarque SD → Remate DC
22. *overload* — Pase MC → Desmarque DFD → Pase MC → Desmarque DC → Remate MC
23. *third_man* — Pase DFC → Pase MC → Pase MVD → Desmarque SD → Tiro DC
24. *carrilero_run* — Pase DFD → Desmarque MC → Pase MVI → Remate DC
25. *carrilero_run* — Pase DFD → Desmarque MC → Pase MVI → Remate MC
26. *carrilero_run* — Pase DFD → Desmarque MC → Pase MVI → Remate DC

### 5-3-2 · ataque por derecha (26 jugadas)

 1. *build_central* — Pase MC → Pase MVD → Desmarque SD → Pase DC → Tiro SD
 2. *build_paciente* — Pase MC → Pase MVD → Pase MC → Desmarque SD → Tiro DC
 3. *switch_play* — Pase MC → Pase MVI → Regate MVD → Pase MC → Remate SD
 4. *wing_overlap* — Pase MC → Regate MVD → Pase LD → Pase MVD → Remate DC
 5. *wing_overlap* — Pase MC → Regate MVD → Pase LD → Pase MVD → Remate SD
 6. *wing_cutback* — Pase MVD → Regate MVD → Desmarque MC → Pase MVD → Tiro DC
 7. *wing_cutback* — Pase MVD → Regate MVD → Desmarque SD → Pase MVD → Tiro SD
 8. *through_ball* — Pase DFC → Pase MC → Desmarque MVD → Desmarque SD → Tiro DC
 9. *through_ball* — Pase DFD → Pase MC → Desmarque MVI → Desmarque DC → Tiro SD
10. *give_and_go* — Pase MC → Pase SD → Desmarque MC → Pase SD → Tiro DC
11. *counter* — Pase DFI → Regate MVD → Pase MC → Desmarque DC → Tiro SD
12. *counter* — Pase DFC → Regate MVD → Pase MC → Desmarque SD → Tiro DC
13. *counter* — Pase DFD → Regate MVD → Pase MC → Desmarque DC → Tiro MVD
14. *long_ball* — Pase DFC → Desmarque SD → Pase DC → Desmarque SD → Remate DC
15. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate SD
16. *long_ball* — Pase DFD → Desmarque SD → Pase DC → Desmarque SD → Remate MVD
17. *long_shot* — Pase MC → Regate MC → Tiro SD
18. *long_shot* — Pase MC → Regate MC → Tiro DC
19. *solo_run* — Regate MVD → Regate MVD → Regate SD → Tiro DC
20. *solo_run* — Regate MVD → Regate MVD → Regate SD → Tiro DC
21. *overload* — Pase MVD → Desmarque LD → Pase MC → Desmarque DC → Remate SD
22. *overload* — Pase MVD → Desmarque LD → Pase MC → Desmarque SD → Remate DC
23. *third_man* — Pase DFD → Pase MC → Pase MVD → Desmarque DC → Tiro SD
24. *carrilero_run* — Pase MC → Desmarque MVD → Pase MC → Remate SD
25. *carrilero_run* — Pase MC → Desmarque MVD → Pase MC → Remate SD
26. *carrilero_run* — Pase MC → Desmarque MVD → Pase MC → Remate MVD

## 5-4-1
*78 jugadas de campo · izquierda 26 · centro 26 · derecha 26*

**Dibujo (posiciones de campo):** Defensa: LI · DFI · DFC · DFD · LD  |  Mediocampo: MVI · MCDI · MCDD · MVD  |  Ataque: DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×47, Tiro ×38, Remate ×25, Pase ×19, Regate ×10 · ⚽×63
- **MCDD** (Pivote derecho): Pase ×38, Desmarque ×10, Regate ×9, Remate ×2, Tiro ×2 · ⚽×4
- **MCDI** (Pivote izquierdo): Pase ×38, Desmarque ×9, Regate ×5, Tiro ×3, Remate ×2 · ⚽×5
- **MVI** (Carrilero izquierdo): Pase ×13, Regate ×12, Desmarque ×3, Remate ×2, Tiro ×1 · ⚽×3
- **MVD** (Carrilero derecho): Pase ×12, Regate ×12, Desmarque ×3, Remate ×2, Tiro ×1 · ⚽×3
- **DFI** (Central izquierdo): Pase ×13, Desmarque ×1
- **DFD** (Central derecho): Pase ×11, Desmarque ×1
- **DFC** (Central): Pase ×11
- **LD** (Lateral derecho): Pase ×2, Desmarque ×2
- **LI** (Lateral izquierdo): Pase ×2, Desmarque ×2

### 5-4-1 · ataque por izquierda (26 jugadas)

 1. *build_central* — Pase MCDI → Pase MCDD → Desmarque MCDI → Pase DC → Tiro DC
 2. *build_paciente* — Pase DFI → Pase MVI → Pase MCDD → Desmarque DC → Tiro DC
 3. *switch_play* — Pase MCDI → Pase MVD → Regate MVI → Pase MCDD → Remate DC
 4. *wing_overlap* — Pase MCDD → Regate MVI → Pase LI → Pase MVI → Remate DC
 5. *wing_overlap* — Pase MCDI → Regate MVI → Pase LI → Pase MVI → Remate DC
 6. *wing_cutback* — Pase MVI → Regate MVI → Desmarque DC → Pase MVI → Tiro DC
 7. *wing_cutback* — Pase MVI → Regate MVI → Desmarque MCDI → Pase MVI → Tiro DC
 8. *through_ball* — Pase DFI → Pase MCDI → Desmarque MCDD → Desmarque DC → Tiro DC
 9. *through_ball* — Pase DFI → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro DC
10. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCDD → Pase DC → Tiro DC
11. *counter* — Pase DFI → Regate MVI → Pase MCDI → Desmarque DC → Tiro DC
12. *counter* — Pase DFI → Regate MVI → Pase MCDD → Desmarque DC → Tiro DC
13. *counter* — Pase DFI → Regate MVI → Pase MCDI → Desmarque DC → Tiro MVI
14. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate DC
15. *long_ball* — Pase DFC → Desmarque DC → Pase DC → Desmarque DC → Remate DC
16. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate MVI
17. *long_shot* — Pase MCDI → Regate MCDD → Tiro DC
18. *long_shot* — Pase MCDD → Regate MCDI → Tiro DC
19. *solo_run* — Regate MVI → Regate MVI → Regate DC → Tiro DC
20. *solo_run* — Regate MVI → Regate MVI → Regate DC → Tiro DC
21. *overload* — Pase MVI → Desmarque LI → Pase MCDI → Desmarque DC → Remate DC
22. *overload* — Pase MVI → Desmarque LI → Pase MCDD → Desmarque DC → Remate DC
23. *third_man* — Pase MCDD → Pase MCDI → Pase MVI → Desmarque DC → Tiro DC
24. *carrilero_run* — Pase MCDD → Desmarque MVI → Pase MCDI → Remate DC
25. *carrilero_run* — Pase MCDI → Desmarque MVI → Pase MCDD → Remate DC
26. *carrilero_run* — Pase DFD → Desmarque MVI → Pase MVD → Remate MVI

### 5-4-1 · ataque por centro (26 jugadas)

 1. *build_central* — Pase MCDD → Pase MCDI → Desmarque DC → Pase DC → Tiro DC
 2. *build_paciente* — Pase DFC → Pase MCDD → Pase MCDI → Desmarque DC → Tiro DC
 3. *switch_play* — Pase MCDD → Pase MCDI → Regate MCDD → Pase MCDI → Remate DC
 4. *wing_overlap* — Pase MCDI → Regate DC → Pase DFI → Pase MCDD → Remate DC
 5. *wing_overlap* — Pase MCDD → Regate MCDD → Pase DFD → Pase MCDI → Remate MCDD
 6. *wing_cutback* — Pase MCDI → Regate MCDI → Desmarque MCDD → Pase DC → Tiro DC
 7. *wing_cutback* — Pase MCDD → Regate DC → Desmarque MCDD → Pase MCDI → Tiro MCDD
 8. *through_ball* — Pase DFC → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro DC
 9. *through_ball* — Pase DFC → Pase MCDI → Desmarque MCDD → Desmarque DC → Tiro MCDD
10. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCDI → Pase DC → Tiro DC
11. *counter* — Pase DFC → Regate MCDD → Pase MCDI → Desmarque DC → Tiro DC
12. *counter* — Pase DFC → Regate MCDI → Pase MCDD → Desmarque DC → Tiro MCDI
13. *counter* — Pase DFC → Regate DC → Pase MCDD → Desmarque DC → Tiro DC
14. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
15. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate MCDD
16. *long_ball* — Pase DFC → Desmarque DC → Pase DC → Desmarque DC → Remate DC
17. *long_shot* — Pase MCDD → Regate MCDI → Tiro DC
18. *long_shot* — Pase MCDI → Regate MCDD → Tiro MCDI
19. *solo_run* — Regate MCDD → Regate MCDD → Regate DC → Tiro DC
20. *solo_run* — Regate MCDD → Regate DC → Regate DC → Tiro MCDI
21. *overload* — Pase MCDD → Desmarque DFI → Pase MCDD → Desmarque DC → Remate DC
22. *overload* — Pase MCDI → Desmarque DFD → Pase MCDI → Desmarque DC → Remate MCDI
23. *third_man* — Pase DFI → Pase MCDI → Pase MCDD → Desmarque DC → Tiro DC
24. *carrilero_run* — Pase DFI → Desmarque MCDD → Pase MCDI → Remate DC
25. *carrilero_run* — Pase MCDD → Desmarque MCDI → Pase MCDD → Remate MCDI
26. *carrilero_run* — Pase MCDI → Desmarque MCDD → Pase MCDI → Remate DC

### 5-4-1 · ataque por derecha (26 jugadas)

 1. *build_central* — Pase MCDI → Pase MCDD → Desmarque MCDI → Pase DC → Tiro DC
 2. *build_paciente* — Pase DFD → Pase MVD → Pase MCDD → Desmarque DC → Tiro DC
 3. *switch_play* — Pase MCDI → Pase MVI → Regate MVD → Pase MVI → Remate DC
 4. *wing_overlap* — Pase MCDD → Regate MVD → Pase LD → Pase MVD → Remate DC
 5. *wing_overlap* — Pase MCDI → Regate MVD → Pase LD → Pase MVD → Remate DC
 6. *wing_cutback* — Pase MVD → Regate MVD → Desmarque MCDI → Pase MVD → Tiro DC
 7. *wing_cutback* — Pase MVD → Regate MVD → Desmarque MCDD → Pase MVD → Tiro DC
 8. *through_ball* — Pase DFD → Pase MCDI → Desmarque MCDD → Desmarque DC → Tiro DC
 9. *through_ball* — Pase DFD → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro DC
10. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCDD → Pase DC → Tiro DC
11. *counter* — Pase DFD → Regate MVD → Pase MCDI → Desmarque DC → Tiro DC
12. *counter* — Pase DFD → Regate MVD → Pase MCDD → Desmarque DC → Tiro DC
13. *counter* — Pase DFD → Regate MVD → Pase MCDI → Desmarque DC → Tiro MVD
14. *long_ball* — Pase DFC → Desmarque DC → Pase DC → Desmarque DC → Remate DC
15. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
16. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate MVD
17. *long_shot* — Pase MCDI → Regate MCDD → Tiro DC
18. *long_shot* — Pase MCDD → Regate MCDI → Tiro DC
19. *solo_run* — Regate MVD → Regate MVD → Regate DC → Tiro DC
20. *solo_run* — Regate MVD → Regate MVD → Regate DC → Tiro DC
21. *overload* — Pase MVD → Desmarque LD → Pase MCDI → Desmarque DC → Remate DC
22. *overload* — Pase MVD → Desmarque LD → Pase MCDD → Desmarque DC → Remate DC
23. *third_man* — Pase DFC → Pase MCDD → Pase MVD → Desmarque DC → Tiro DC
24. *carrilero_run* — Pase DFC → Desmarque MVD → Pase MCDD → Remate DC
25. *carrilero_run* — Pase DFI → Desmarque MVD → Pase MVI → Remate DC
26. *carrilero_run* — Pase MCDD → Desmarque MVD → Pase MCDI → Remate MVD

## 5-1-3-1
*78 jugadas de campo · izquierda 26 · centro 26 · derecha 26*

**Dibujo (posiciones de campo):** Defensa: LI · DFI · DFC · DFD · LD  |  Mediocampo: MCD · MVI · MCO · MVD  |  Ataque: DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×47, Tiro ×38, Remate ×25, Pase ×19, Regate ×10 · ⚽×63
- **MCO** (Mediapunta): Pase ×38, Desmarque ×10, Regate ×9, Remate ×2, Tiro ×2 · ⚽×4
- **MCD** (Pivote): Pase ×39, Desmarque ×8, Regate ×5, Tiro ×3, Remate ×2 · ⚽×5
- **MVI** (Carrilero izquierdo): Pase ×12, Regate ×12, Desmarque ×4, Remate ×2, Tiro ×1 · ⚽×3
- **MVD** (Carrilero derecho): Pase ×12, Regate ×12, Desmarque ×3, Remate ×2, Tiro ×1 · ⚽×3
- **DFI** (Central izquierdo): Pase ×13, Desmarque ×1
- **DFD** (Central derecho): Pase ×11, Desmarque ×1
- **DFC** (Central): Pase ×11
- **LD** (Lateral derecho): Pase ×2, Desmarque ×2
- **LI** (Lateral izquierdo): Pase ×2, Desmarque ×2

### 5-1-3-1 · ataque por izquierda (26 jugadas)

 1. *build_central* — Pase MCD → Pase MCO → Desmarque MCD → Pase DC → Tiro DC
 2. *build_paciente* — Pase DFI → Pase MVI → Pase MCO → Desmarque DC → Tiro DC
 3. *switch_play* — Pase MCD → Pase MVD → Regate MVI → Pase MCO → Remate DC
 4. *wing_overlap* — Pase MCO → Regate MVI → Pase LI → Pase MVI → Remate DC
 5. *wing_overlap* — Pase MCD → Regate MVI → Pase LI → Pase MVI → Remate DC
 6. *wing_cutback* — Pase MVI → Regate MVI → Desmarque DC → Pase MVI → Tiro DC
 7. *wing_cutback* — Pase MVI → Regate MVI → Desmarque MCD → Pase MVI → Tiro DC
 8. *through_ball* — Pase DFI → Pase MCD → Desmarque MCO → Desmarque DC → Tiro DC
 9. *through_ball* — Pase DFI → Pase MCO → Desmarque MCD → Desmarque DC → Tiro DC
10. *give_and_go* — Pase MCO → Pase DC → Desmarque MCO → Pase DC → Tiro DC
11. *counter* — Pase DFI → Regate MVI → Pase MCD → Desmarque DC → Tiro DC
12. *counter* — Pase DFI → Regate MVI → Pase MCO → Desmarque DC → Tiro DC
13. *counter* — Pase DFI → Regate MVI → Pase MCD → Desmarque DC → Tiro MVI
14. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate DC
15. *long_ball* — Pase DFC → Desmarque DC → Pase DC → Desmarque DC → Remate DC
16. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate MVI
17. *long_shot* — Pase MCD → Regate MCO → Tiro DC
18. *long_shot* — Pase MCO → Regate MCD → Tiro DC
19. *solo_run* — Regate MVI → Regate MVI → Regate DC → Tiro DC
20. *solo_run* — Regate MVI → Regate MVI → Regate DC → Tiro DC
21. *overload* — Pase MVI → Desmarque LI → Pase MCD → Desmarque DC → Remate DC
22. *overload* — Pase MVI → Desmarque LI → Pase MCO → Desmarque DC → Remate DC
23. *third_man* — Pase MCO → Pase MCD → Pase MVI → Desmarque DC → Tiro DC
24. *carrilero_run* — Pase MCO → Desmarque MVI → Pase MCD → Remate DC
25. *carrilero_run* — Pase MCD → Desmarque MVI → Pase MCO → Remate DC
26. *carrilero_run* — Pase DFD → Desmarque MVI → Pase MVD → Remate MVI

### 5-1-3-1 · ataque por centro (26 jugadas)

 1. *build_central* — Pase MCO → Pase MCD → Desmarque DC → Pase DC → Tiro DC
 2. *build_paciente* — Pase DFC → Pase MCO → Pase MCD → Desmarque DC → Tiro DC
 3. *switch_play* — Pase MCO → Pase MCD → Regate MCO → Pase MCD → Remate DC
 4. *wing_overlap* — Pase MCD → Regate DC → Pase DFI → Pase MCO → Remate DC
 5. *wing_overlap* — Pase MCO → Regate MCO → Pase DFD → Pase MCD → Remate MCO
 6. *wing_cutback* — Pase MCD → Regate MCD → Desmarque MCO → Pase DC → Tiro DC
 7. *wing_cutback* — Pase MCO → Regate DC → Desmarque MCO → Pase MCD → Tiro MCO
 8. *through_ball* — Pase DFC → Pase MCO → Desmarque MCD → Desmarque DC → Tiro DC
 9. *through_ball* — Pase DFC → Pase MCD → Desmarque MCO → Desmarque DC → Tiro MCO
10. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD → Pase DC → Tiro DC
11. *counter* — Pase DFC → Regate MCO → Pase MCD → Desmarque DC → Tiro DC
12. *counter* — Pase DFC → Regate MCD → Pase MCO → Desmarque DC → Tiro MCD
13. *counter* — Pase DFC → Regate DC → Pase MCO → Desmarque DC → Tiro DC
14. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
15. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate MCO
16. *long_ball* — Pase DFC → Desmarque DC → Pase DC → Desmarque DC → Remate DC
17. *long_shot* — Pase MCO → Regate MCD → Tiro DC
18. *long_shot* — Pase MCD → Regate MCO → Tiro MCD
19. *solo_run* — Regate MCO → Regate MCO → Regate DC → Tiro DC
20. *solo_run* — Regate MCO → Regate DC → Regate DC → Tiro MCD
21. *overload* — Pase MCO → Desmarque DFI → Pase MCO → Desmarque DC → Remate DC
22. *overload* — Pase MCD → Desmarque DFD → Pase MCD → Desmarque DC → Remate MCD
23. *third_man* — Pase DFI → Pase MCD → Pase MCO → Desmarque DC → Tiro DC
24. *carrilero_run* — Pase DFI → Desmarque MCO → Pase MCD → Remate DC
25. *carrilero_run* — Pase MCO → Desmarque MCD → Pase MCO → Remate MCD
26. *carrilero_run* — Pase MCD → Desmarque MCO → Pase MCD → Remate DC

### 5-1-3-1 · ataque por derecha (26 jugadas)

 1. *build_central* — Pase MCD → Pase MCO → Desmarque MCD → Pase DC → Tiro DC
 2. *build_paciente* — Pase DFD → Pase MVD → Pase MCO → Desmarque DC → Tiro DC
 3. *switch_play* — Pase MCD → Pase MVI → Regate MVD → Pase MCD → Remate DC
 4. *wing_overlap* — Pase MCO → Regate MVD → Pase LD → Pase MVD → Remate DC
 5. *wing_overlap* — Pase MCD → Regate MVD → Pase LD → Pase MVD → Remate DC
 6. *wing_cutback* — Pase MVD → Regate MVD → Desmarque MVI → Pase MVD → Tiro DC
 7. *wing_cutback* — Pase MVD → Regate MVD → Desmarque MCO → Pase MVD → Tiro DC
 8. *through_ball* — Pase DFD → Pase MCD → Desmarque MCO → Desmarque DC → Tiro DC
 9. *through_ball* — Pase DFD → Pase MCO → Desmarque MCD → Desmarque DC → Tiro DC
10. *give_and_go* — Pase MCO → Pase DC → Desmarque MCO → Pase DC → Tiro DC
11. *counter* — Pase DFD → Regate MVD → Pase MCD → Desmarque DC → Tiro DC
12. *counter* — Pase DFD → Regate MVD → Pase MCO → Desmarque DC → Tiro DC
13. *counter* — Pase DFD → Regate MVD → Pase MCD → Desmarque DC → Tiro MVD
14. *long_ball* — Pase DFC → Desmarque DC → Pase DC → Desmarque DC → Remate DC
15. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
16. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate MVD
17. *long_shot* — Pase MCD → Regate MCO → Tiro DC
18. *long_shot* — Pase MCO → Regate MCD → Tiro DC
19. *solo_run* — Regate MVD → Regate MVD → Regate DC → Tiro DC
20. *solo_run* — Regate MVD → Regate MVD → Regate DC → Tiro DC
21. *overload* — Pase MVD → Desmarque LD → Pase MCD → Desmarque DC → Remate DC
22. *overload* — Pase MVD → Desmarque LD → Pase MCO → Desmarque DC → Remate DC
23. *third_man* — Pase DFC → Pase MCO → Pase MVD → Desmarque DC → Tiro DC
24. *carrilero_run* — Pase DFC → Desmarque MVD → Pase MCO → Remate DC
25. *carrilero_run* — Pase DFI → Desmarque MVD → Pase MCD → Remate DC
26. *carrilero_run* — Pase MCO → Desmarque MVD → Pase MVI → Remate MVD

## 4-5-1
*105 jugadas de campo · izquierda 35 · centro 35 · derecha 35*

**Dibujo (posiciones de campo):** Defensa: LI · DFI · DFD · LD  |  Mediocampo: MI · MCDI · MCO · MCDD · MD  |  Ataque: DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×56, Tiro ×50, Pase ×35, Remate ×27, Regate ×9 · ⚽×77
- **MCDI** (Pivote izquierdo): Pase ×48, Desmarque ×9, Regate ×7, Tiro ×3 · ⚽×3
- **MCDD** (Pivote derecho): Pase ×44, Desmarque ×12, Regate ×6, Remate ×2, Tiro ×1 · ⚽×3
- **MCO** (Mediapunta): Pase ×41, Desmarque ×7, Tiro ×5, Regate ×4, Remate ×3 · ⚽×8
- **MI** (Medio izquierdo): Pase ×20, Regate ×14, Tiro ×5, Desmarque ×3, Remate ×2 · ⚽×7
- **MD** (Medio derecho): Pase ×18, Regate ×14, Tiro ×5, Desmarque ×3, Remate ×2 · ⚽×7
- **DFI** (Central izquierdo): Pase ×17, Desmarque ×1
- **DFD** (Central derecho): Pase ×16, Desmarque ×1
- **LD** (Lateral derecho): Pase ×2, Desmarque ×2
- **LI** (Lateral izquierdo): Pase ×2, Desmarque ×2

### 4-5-1 · ataque por izquierda (35 jugadas)

 1. *build_central* — Pase MCDI → Pase MCDD → Desmarque DC → Pase DC → Tiro DC
 2. *build_central* — Pase MCDD → Pase MCDI → Desmarque MCDD → Pase DC → Tiro DC
 3. *build_central* — Pase MCO → Pase MCDD → Desmarque MCDI → Pase DC → Tiro MI
 4. *build_paciente* — Pase DFI → Pase MI → Pase MCDD → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase DFI → Pase MI → Pase MCO → Desmarque DC → Tiro DC
 6. *build_paciente* — Pase DFI → Pase MI → Pase MCDI → Desmarque DC → Tiro MI
 7. *switch_play* — Pase MCDI → Pase MD → Regate MI → Pase MCO → Remate DC
 8. *switch_play* — Pase MCDD → Pase MD → Regate MI → Pase MCDD → Remate DC
 9. *switch_play* — Pase MCO → Pase MD → Regate MI → Pase MD → Remate MI
10. *wing_overlap* — Pase MCDI → Regate MI → Pase LI → Pase MI → Remate DC
11. *wing_overlap* — Pase MCDD → Regate MI → Pase LI → Pase MI → Remate DC
12. *wing_cutback* — Pase MI → Regate MI → Desmarque MCDD → Pase MI → Tiro DC
13. *wing_cutback* — Pase MI → Regate MI → Desmarque MCDD → Pase MI → Tiro DC
14. *through_ball* — Pase DFI → Pase MCDI → Desmarque MCDD → Desmarque DC → Tiro DC
15. *through_ball* — Pase DFI → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro DC
16. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCDD → Pase DC → Tiro DC
17. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCO → Pase DC → Tiro DC
18. *give_and_go* — Pase MCO → Pase DC → Desmarque MCDI → Pase DC → Tiro MI
19. *counter* — Pase DFI → Regate MI → Pase MCDD → Desmarque DC → Tiro DC
20. *counter* — Pase DFI → Regate MI → Pase MCO → Desmarque DC → Tiro DC
21. *counter* — Pase DFI → Regate MI → Pase MCDI → Desmarque DC → Tiro MI
22. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate DC
23. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
24. *long_shot* — Pase MCO → Regate MCDD → Tiro DC
25. *long_shot* — Pase MCO → Regate MCDD → Tiro DC
26. *solo_run* — Regate MI → Regate MI → Regate DC → Tiro DC
27. *solo_run* — Regate MI → Regate MI → Regate DC → Tiro DC
28. *overload* — Pase MI → Desmarque LI → Pase MCDD → Desmarque DC → Remate DC
29. *overload* — Pase MI → Desmarque LI → Pase MCO → Desmarque DC → Remate DC
30. *third_man* — Pase MCDD → Pase MCDI → Pase MI → Desmarque DC → Tiro DC
31. *third_man* — Pase MCDD → Pase MCO → Pase MI → Desmarque DC → Tiro DC
32. *third_man* — Pase MCDD → Pase MCDI → Pase MI → Desmarque DC → Tiro MI
33. *carrilero_run* — Pase MCDD → Desmarque MI → Pase MCDI → Remate DC
34. *carrilero_run* — Pase MCO → Desmarque MI → Pase MCDI → Remate DC
35. *carrilero_run* — Pase MCDI → Desmarque MI → Pase MCDI → Remate MI

### 4-5-1 · ataque por centro (35 jugadas)

 1. *build_central* — Pase MCO → Pase MCDD → Desmarque MCDI → Pase DC → Tiro DC
 2. *build_central* — Pase MCDI → Pase MCO → Desmarque DC → Pase DC → Tiro MCO
 3. *build_central* — Pase MCDD → Pase MCO → Desmarque MCDD → Pase DC → Tiro DC
 4. *build_paciente* — Pase DFD → Pase MCDD → Pase MCO → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase DFD → Pase MCO → Pase MCDI → Desmarque DC → Tiro MCO
 6. *build_paciente* — Pase DFD → Pase MCDI → Pase MCDD → Desmarque DC → Tiro DC
 7. *switch_play* — Pase MCO → Pase MCDD → Regate MCDD → Pase MCO → Remate DC
 8. *switch_play* — Pase MCDI → Pase MCO → Regate DC → Pase MCDI → Remate MCDD
 9. *switch_play* — Pase MCDD → Pase MCO → Regate MCDI → Pase MCDD → Remate DC
10. *wing_overlap* — Pase MCO → Regate MCDI → Pase DFD → Pase MCDD → Remate DC
11. *wing_overlap* — Pase MCDI → Regate MCO → Pase DFI → Pase DC → Remate MCO
12. *wing_cutback* — Pase MCDD → Regate MCDD → Desmarque MCO → Pase DC → Tiro DC
13. *wing_cutback* — Pase MCO → Regate DC → Desmarque MCDI → Pase MCDD → Tiro MCDI
14. *through_ball* — Pase DFD → Pase MCO → Desmarque MCDD → Desmarque DC → Tiro DC
15. *through_ball* — Pase DFD → Pase MCDI → Desmarque MCO → Desmarque DC → Tiro MCDI
16. *give_and_go* — Pase MCO → Pase DC → Desmarque MCDI → Pase DC → Tiro DC
17. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCDD → Pase DC → Tiro MCO
18. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCO → Pase DC → Tiro DC
19. *counter* — Pase DFD → Regate MCO → Pase MCDI → Desmarque DC → Tiro DC
20. *counter* — Pase DFD → Regate MCDD → Pase MCO → Desmarque DC → Tiro MCO
21. *counter* — Pase DFD → Regate DC → Pase MCO → Desmarque DC → Tiro DC
22. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate DC
23. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate MCO
24. *long_shot* — Pase MCDD → Regate MCDI → Tiro DC
25. *long_shot* — Pase MCDD → Regate MCDI → Tiro MCO
26. *solo_run* — Regate MCDD → Regate MCDI → Regate DC → Tiro DC
27. *solo_run* — Regate MCDI → Regate MCDI → Regate DC → Tiro MCDI
28. *overload* — Pase MCO → Desmarque DFI → Pase MCDI → Desmarque DC → Remate DC
29. *overload* — Pase MCDI → Desmarque DFD → Pase MCDD → Desmarque DC → Remate MCO
30. *third_man* — Pase DFI → Pase MCDI → Pase MCDD → Desmarque DC → Tiro DC
31. *third_man* — Pase DFI → Pase MCDD → Pase MCDI → Desmarque DC → Tiro MCDD
32. *third_man* — Pase DFI → Pase MCO → Pase MCDD → Desmarque DC → Tiro DC
33. *carrilero_run* — Pase DFI → Desmarque MCDI → Pase MCO → Remate DC
34. *carrilero_run* — Pase MCDD → Desmarque MCO → Pase MCDI → Remate MCDD
35. *carrilero_run* — Pase MCO → Desmarque MCDD → Pase MCDI → Remate DC

### 4-5-1 · ataque por derecha (35 jugadas)

 1. *build_central* — Pase MCDD → Pase MCO → Desmarque MCDD → Pase DC → Tiro DC
 2. *build_central* — Pase MCO → Pase MCDI → Desmarque MCO → Pase DC → Tiro DC
 3. *build_central* — Pase MCDI → Pase MCDD → Desmarque DC → Pase DC → Tiro MD
 4. *build_paciente* — Pase MCDI → Pase MD → Pase MCO → Desmarque DC → Tiro DC
 5. *build_paciente* — Pase MCDI → Pase MD → Pase MCDI → Desmarque DC → Tiro DC
 6. *build_paciente* — Pase MCDI → Pase MD → Pase MCDD → Desmarque DC → Tiro MD
 7. *switch_play* — Pase MCDD → Pase MI → Regate MD → Pase MCDI → Remate DC
 8. *switch_play* — Pase MCO → Pase MI → Regate MD → Pase MCO → Remate DC
 9. *switch_play* — Pase MCDI → Pase MI → Regate MD → Pase MCDD → Remate MD
10. *wing_overlap* — Pase MCDD → Regate MD → Pase LD → Pase MD → Remate DC
11. *wing_overlap* — Pase MCO → Regate MD → Pase LD → Pase MD → Remate DC
12. *wing_cutback* — Pase MD → Regate MD → Desmarque DC → Pase MD → Tiro DC
13. *wing_cutback* — Pase MD → Regate MD → Desmarque DC → Pase MD → Tiro DC
14. *through_ball* — Pase MCDI → Pase MCO → Desmarque MCDD → Desmarque DC → Tiro DC
15. *through_ball* — Pase MCDI → Pase MCDD → Desmarque MCDI → Desmarque DC → Tiro DC
16. *give_and_go* — Pase MCDD → Pase DC → Desmarque MCO → Pase DC → Tiro DC
17. *give_and_go* — Pase MCO → Pase DC → Desmarque MCDI → Pase DC → Tiro DC
18. *give_and_go* — Pase MCDI → Pase DC → Desmarque MCDD → Pase DC → Tiro MD
19. *counter* — Pase MCDI → Regate MD → Pase MCO → Desmarque DC → Tiro DC
20. *counter* — Pase MCDI → Regate MD → Pase MCDI → Desmarque DC → Tiro DC
21. *counter* — Pase MCDI → Regate MD → Pase MCDD → Desmarque DC → Tiro MD
22. *long_ball* — Pase DFD → Desmarque DC → Pase DC → Desmarque DC → Remate DC
23. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
24. *long_shot* — Pase MCDI → Regate MCO → Tiro DC
25. *long_shot* — Pase MCDI → Regate MCO → Tiro DC
26. *solo_run* — Regate MD → Regate MD → Regate DC → Tiro DC
27. *solo_run* — Regate MD → Regate MD → Regate DC → Tiro DC
28. *overload* — Pase MD → Desmarque LD → Pase MCO → Desmarque DC → Remate DC
29. *overload* — Pase MD → Desmarque LD → Pase MCDI → Desmarque DC → Remate DC
30. *third_man* — Pase DFD → Pase MCO → Pase MD → Desmarque DC → Tiro DC
31. *third_man* — Pase DFD → Pase MCDI → Pase MD → Desmarque DC → Tiro DC
32. *third_man* — Pase DFD → Pase MCDD → Pase MD → Desmarque DC → Tiro MD
33. *carrilero_run* — Pase DFD → Desmarque MD → Pase MI → Remate DC
34. *carrilero_run* — Pase DFI → Desmarque MD → Pase MI → Remate DC
35. *carrilero_run* — Pase MCDD → Desmarque MD → Pase MI → Remate MD

## 1-4-3-2
*93 jugadas de campo · izquierda 31 · centro 31 · derecha 31*

**Dibujo (posiciones de campo):** Defensa: DFI  |  Mediocampo: MCD · MCD2 · MCD3 · MCD4 · MI · MCO · MD  |  Ataque: SD · DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **SD** (Segundo delantero): Desmarque ×29, Tiro ×25, Pase ×12, Remate ×11, Regate ×10 · ⚽×36
- **DC** (Delantero centro): Desmarque ×26, Tiro ×21, Remate ×16, Pase ×15 · ⚽×37
- **MCD3** (Pivote): Pase ×35, Desmarque ×7, Regate ×3
- **MCD** (Pivote): Pase ×30, Tiro ×5, Regate ×4, Desmarque ×3, Remate ×1 · ⚽×6
- **MCD2** (Pivote): Pase ×27, Desmarque ×4, Regate ×4, Remate ×1 · ⚽×1
- **MD** (Medio derecho): Pase ×15, Regate ×13, Desmarque ×3, Remate ×2, Tiro ×1 · ⚽×3
- **MI** (Medio izquierdo): Pase ×15, Regate ×13, Desmarque ×3, Remate ×2, Tiro ×1 · ⚽×3
- **MCO** (Mediapunta): Pase ×22, Desmarque ×4, Tiro ×4, Remate ×2, Regate ×1 · ⚽×6
- **MCD4** (Pivote): Pase ×18, Desmarque ×5, Regate ×3, Remate ×1 · ⚽×1
- **DFI** (Central izquierdo): Pase ×15, Desmarque ×6

### 1-4-3-2 · ataque por izquierda (31 jugadas)

 1. *build_central* — Pase MCD → Pase MCD3 → Desmarque MCD4 → Pase DC → Tiro SD
 2. *build_central* — Pase MCD → Pase MCD4 → Desmarque MCD2 → Pase SD → Tiro DC
 3. *build_paciente* — Pase MCD → Pase MI → Pase MCD3 → Desmarque DC → Tiro SD
 4. *build_paciente* — Pase MCD → Pase MI → Pase MCD3 → Desmarque SD → Tiro DC
 5. *switch_play* — Pase MCD → Pase MD → Regate MI → Pase MD → Remate SD
 6. *switch_play* — Pase MCD → Pase MD → Regate MI → Pase MCO → Remate DC
 7. *wing_overlap* — Pase MCD → Regate MI → Pase DFI → Pase MI → Remate SD
 8. *wing_overlap* — Pase MCD → Regate MI → Pase DFI → Pase MI → Remate DC
 9. *wing_cutback* — Pase MI → Regate MI → Desmarque MCD3 → Pase MI → Tiro SD
10. *wing_cutback* — Pase MI → Regate MI → Desmarque DC → Pase MI → Tiro DC
11. *through_ball* — Pase MCD → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SD
12. *through_ball* — Pase MCD → Pase MCD2 → Desmarque MCD3 → Desmarque SD → Tiro DC
13. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD3 → Pase DC → Tiro SD
14. *give_and_go* — Pase MCD → Pase SD → Desmarque MCD3 → Pase SD → Tiro DC
15. *counter* — Pase MCD → Regate MI → Pase MCD3 → Desmarque DC → Tiro SD
16. *counter* — Pase MCD → Regate MI → Pase MCD3 → Desmarque SD → Tiro DC
17. *counter* — Pase MCD → Regate MI → Pase MCD3 → Desmarque DC → Tiro MI
18. *long_ball* — Pase DFI → Desmarque SD → Pase DC → Desmarque SD → Remate DC
19. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate SD
20. *long_ball* — Pase DFI → Desmarque SD → Pase DC → Desmarque SD → Remate MI
21. *long_shot* — Pase MCD → Regate MCD2 → Tiro SD
22. *long_shot* — Pase MCD4 → Regate MCO → Tiro DC
23. *solo_run* — Regate MI → Regate MI → Regate SD → Tiro DC
24. *solo_run* — Regate MI → Regate MI → Regate SD → Tiro DC
25. *overload* — Pase MI → Desmarque DFI → Pase MCD2 → Desmarque DC → Remate SD
26. *overload* — Pase MI → Desmarque DFI → Pase MCD2 → Desmarque SD → Remate DC
27. *third_man* — Pase MCO → Pase MCD2 → Pase MI → Desmarque DC → Tiro SD
28. *third_man* — Pase MCO → Pase MCD3 → Pase MI → Desmarque SD → Tiro DC
29. *carrilero_run* — Pase MCO → Desmarque MI → Pase MCO → Remate DC
30. *carrilero_run* — Pase MCD4 → Desmarque MI → Pase MCD3 → Remate DC
31. *carrilero_run* — Pase MCD3 → Desmarque MI → Pase MCD → Remate MI

### 1-4-3-2 · ataque por centro (31 jugadas)

 1. *build_central* — Pase MCD2 → Pase MCO → Desmarque SD → Pase DC → Tiro SD
 2. *build_central* — Pase MCD2 → Pase MCD → Desmarque MCO → Pase SD → Tiro MCD
 3. *build_paciente* — Pase MCD2 → Pase MCD3 → Pase MCD4 → Desmarque DC → Tiro SD
 4. *build_paciente* — Pase MCD2 → Pase MCD4 → Pase MCO → Desmarque SD → Tiro MCD
 5. *switch_play* — Pase MCD2 → Pase MCO → Regate MCD → Pase MCD3 → Remate SD
 6. *switch_play* — Pase MCD2 → Pase MCD → Regate SD → Pase MCO → Remate MCD4
 7. *wing_overlap* — Pase MCD2 → Regate MCD3 → Pase DFI → Pase MCO → Remate SD
 8. *wing_overlap* — Pase MCD2 → Regate MCD → Pase DFI → Pase MCD3 → Remate MCD2
 9. *wing_cutback* — Pase MCD2 → Regate SD → Desmarque MCD3 → Pase MCO → Tiro SD
10. *wing_cutback* — Pase MCD2 → Regate MCD4 → Desmarque MCD2 → Pase MCD4 → Tiro MCO
11. *through_ball* — Pase MCD2 → Pase MCD3 → Desmarque MCD4 → Desmarque DC → Tiro SD
12. *through_ball* — Pase MCD2 → Pase MCD4 → Desmarque MCO → Desmarque SD → Tiro MCD
13. *give_and_go* — Pase MCD2 → Pase DC → Desmarque MCD4 → Pase DC → Tiro SD
14. *give_and_go* — Pase MCD2 → Pase SD → Desmarque MCD4 → Pase SD → Tiro MCD
15. *counter* — Pase MCD2 → Regate MCD → Pase MCD4 → Desmarque DC → Tiro SD
16. *counter* — Pase MCD2 → Regate SD → Pase MCD4 → Desmarque SD → Tiro MCD
17. *counter* — Pase MCD2 → Regate MCD4 → Pase MCD → Desmarque DC → Tiro SD
18. *long_ball* — Pase DFI → Desmarque SD → Pase DC → Desmarque SD → Remate DC
19. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate MCD
20. *long_ball* — Pase DFI → Desmarque SD → Pase DC → Desmarque SD → Remate DC
21. *long_shot* — Pase MCD2 → Regate MCD3 → Tiro SD
22. *long_shot* — Pase MCO → Regate MCD → Tiro MCO
23. *solo_run* — Regate MCD3 → Regate MCD2 → Regate SD → Tiro DC
24. *solo_run* — Regate MCD2 → Regate SD → Regate SD → Tiro MCO
25. *overload* — Pase MCD → Desmarque DFI → Pase MCD3 → Desmarque DC → Remate SD
26. *overload* — Pase MCD → Desmarque DFI → Pase MCD3 → Desmarque SD → Remate MCO
27. *third_man* — Pase MCD → Pase MCO → Pase MCD → Desmarque DC → Tiro SD
28. *third_man* — Pase MCD → Pase MCD2 → Pase MCD3 → Desmarque SD → Tiro MCO
29. *carrilero_run* — Pase MCD → Desmarque MCD3 → Pase MCD4 → Remate DC
30. *carrilero_run* — Pase MCO → Desmarque MCD2 → Pase MCD4 → Remate MCO
31. *carrilero_run* — Pase MCD4 → Desmarque MCD2 → Pase MCD4 → Remate DC

### 1-4-3-2 · ataque por derecha (31 jugadas)

 1. *build_central* — Pase MCD3 → Pase MCD2 → Desmarque MCD → Pase DC → Tiro SD
 2. *build_central* — Pase MCD3 → Pase MCD4 → Desmarque DC → Pase SD → Tiro DC
 3. *build_paciente* — Pase MCD3 → Pase MD → Pase MCO → Desmarque DC → Tiro SD
 4. *build_paciente* — Pase MCD3 → Pase MD → Pase MCO → Desmarque SD → Tiro DC
 5. *switch_play* — Pase MCD3 → Pase MI → Regate MD → Pase MCD4 → Remate SD
 6. *switch_play* — Pase MCD3 → Pase MI → Regate MD → Pase MCD3 → Remate DC
 7. *wing_overlap* — Pase MCD3 → Regate MD → Pase DFI → Pase MD → Remate SD
 8. *wing_overlap* — Pase MCD3 → Regate MD → Pase DFI → Pase MD → Remate DC
 9. *wing_cutback* — Pase MD → Regate MD → Desmarque SD → Pase MD → Tiro SD
10. *wing_cutback* — Pase MD → Regate MD → Desmarque MCD4 → Pase MD → Tiro DC
11. *through_ball* — Pase MCD3 → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SD
12. *through_ball* — Pase MCD3 → Pase MCD → Desmarque MCD3 → Desmarque SD → Tiro DC
13. *give_and_go* — Pase MCD3 → Pase DC → Desmarque MCO → Pase DC → Tiro SD
14. *give_and_go* — Pase MCD3 → Pase SD → Desmarque MCO → Pase SD → Tiro DC
15. *counter* — Pase MCD3 → Regate MD → Pase MCO → Desmarque DC → Tiro SD
16. *counter* — Pase MCD3 → Regate MD → Pase MCO → Desmarque SD → Tiro DC
17. *counter* — Pase MCD3 → Regate MD → Pase MCO → Desmarque DC → Tiro MD
18. *long_ball* — Pase DFI → Desmarque SD → Pase DC → Desmarque SD → Remate DC
19. *long_ball* — Pase DFI → Desmarque DC → Pase SD → Desmarque DC → Remate SD
20. *long_ball* — Pase DFI → Desmarque SD → Pase DC → Desmarque SD → Remate MD
21. *long_shot* — Pase MCD3 → Regate MCD4 → Tiro SD
22. *long_shot* — Pase MCD → Regate MCD2 → Tiro DC
23. *solo_run* — Regate MD → Regate MD → Regate SD → Tiro DC
24. *solo_run* — Regate MD → Regate MD → Regate SD → Tiro DC
25. *overload* — Pase MD → Desmarque DFI → Pase MCD4 → Desmarque DC → Remate SD
26. *overload* — Pase MD → Desmarque DFI → Pase MCD4 → Desmarque SD → Remate DC
27. *third_man* — Pase MCD2 → Pase MCD3 → Pase MD → Desmarque DC → Tiro SD
28. *third_man* — Pase MCD2 → Pase MCD4 → Pase MD → Desmarque SD → Tiro DC
29. *carrilero_run* — Pase MCD2 → Desmarque MD → Pase MCD3 → Remate DC
30. *carrilero_run* — Pase MCD → Desmarque MD → Pase MCD → Remate DC
31. *carrilero_run* — Pase MCO → Desmarque MD → Pase MI → Remate MD

## 1-4-4-1
*102 jugadas de campo · izquierda 34 · centro 34 · derecha 34*

**Dibujo (posiciones de campo):** Defensa: DFI  |  Mediocampo: MCD · MCD2 · MCD3 · MCD4 · MCO · MCO2 · MCO3 · MCO4  |  Ataque: DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×50, Tiro ×47, Remate ×29, Pase ×26, Regate ×11 · ⚽×76
- **MCO3** (Mediapunta): Pase ×32, Regate ×4, Desmarque ×3, Remate ×2 · ⚽×2
- **MCD4** (Pivote): Pase ×21, Desmarque ×9, Regate ×6, Tiro ×3, Remate ×1 · ⚽×4
- **MCD3** (Pivote): Pase ×30, Regate ×5, Remate ×2, Desmarque ×1, Tiro ×1 · ⚽×3
- **MCO** (Mediapunta): Pase ×19, Regate ×9, Desmarque ×7, Tiro ×3, Remate ×1 · ⚽×4
- **MCD** (Pivote): Pase ×22, Regate ×8, Desmarque ×5, Remate ×2, Tiro ×1 · ⚽×3
- **MCO2** (Mediapunta): Pase ×21, Regate ×7, Desmarque ×5, Tiro ×3 · ⚽×3
- **MCO4** (Mediapunta): Pase ×23, Regate ×5, Remate ×4, Desmarque ×2, Tiro ×1 · ⚽×5
- **MCD2** (Pivote): Pase ×19, Regate ×5, Desmarque ×2, Remate ×1, Tiro ×1 · ⚽×2
- **DFI** (Central izquierdo): Pase ×15, Desmarque ×9

### 1-4-4-1 · ataque por izquierda (34 jugadas)

 1. *build_central* — Pase MCD → Pase MCD3 → Desmarque MCD4 → Pase DC → Tiro DC
 2. *build_central* — Pase MCO2 → Pase MCO4 → Desmarque DC → Pase DC → Tiro DC
 3. *build_paciente* — Pase MCD3 → Pase MCO2 → Pase MCO3 → Desmarque DC → Tiro DC
 4. *build_paciente* — Pase MCO4 → Pase MCD3 → Pase MCO → Desmarque DC → Tiro DC
 5. *switch_play* — Pase MCO → Pase MCD → Regate MCO → Pase MCD3 → Remate DC
 6. *switch_play* — Pase MCD2 → Pase MCO3 → Regate MCD → Pase MCD2 → Remate DC
 7. *switch_play* — Pase MCO3 → Pase MCD4 → Regate MCO2 → Pase MCO3 → Remate MCO4
 8. *wing_overlap* — Pase MCD4 → Regate MCD → Pase DFI → Pase MCD3 → Remate DC
 9. *wing_overlap* — Pase MCD → Regate MCO2 → Pase DFI → Pase MCO4 → Remate DC
10. *wing_overlap* — Pase MCO2 → Regate MCD2 → Pase DFI → Pase MCD4 → Remate MCD
11. *wing_cutback* — Pase MCD3 → Regate MCO3 → Desmarque MCO → Pase MCO3 → Tiro DC
12. *wing_cutback* — Pase MCO4 → Regate MCD3 → Desmarque MCD2 → Pase MCD4 → Tiro DC
13. *wing_cutback* — Pase MCO → Regate MCO4 → Desmarque MCO3 → Pase DC → Tiro MCD
14. *through_ball* — Pase MCD2 → Pase MCO → Desmarque MCO2 → Desmarque DC → Tiro DC
15. *through_ball* — Pase MCO3 → Pase MCD2 → Desmarque MCD4 → Desmarque DC → Tiro DC
16. *give_and_go* — Pase MCD4 → Pase DC → Desmarque MCO2 → Pase DC → Tiro DC
17. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD3 → Pase DC → Tiro DC
18. *counter* — Pase MCO2 → Regate MCO2 → Pase MCD4 → Desmarque DC → Tiro DC
19. *counter* — Pase MCD3 → Regate MCD2 → Pase MCD3 → Desmarque DC → Tiro DC
20. *counter* — Pase MCO4 → Regate MCO3 → Pase MCO4 → Desmarque DC → Tiro MCD4
21. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
22. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
23. *long_shot* — Pase MCO3 → Regate MCO4 → Tiro DC
24. *long_shot* — Pase MCD2 → Regate MCD3 → Tiro DC
25. *solo_run* — Regate MCO → Regate MCD → Regate DC → Tiro DC
26. *solo_run* — Regate MCD → Regate MCO → Regate DC → Tiro DC
27. *overload* — Pase MCO → Desmarque DFI → Pase MCO3 → Desmarque DC → Remate DC
28. *overload* — Pase MCD2 → Desmarque DFI → Pase MCD4 → Desmarque DC → Remate DC
29. *overload* — Pase MCO3 → Desmarque DFI → Pase MCD → Desmarque DC → Remate MCD3
30. *third_man* — Pase MCD4 → Pase MCD → Pase MCD3 → Desmarque DC → Tiro DC
31. *third_man* — Pase MCD → Pase MCO3 → Pase MCO4 → Desmarque DC → Tiro DC
32. *carrilero_run* — Pase MCO2 → Desmarque MCD4 → Pase MCO2 → Remate DC
33. *carrilero_run* — Pase MCD2 → Desmarque MCD → Pase MCD3 → Remate DC
34. *carrilero_run* — Pase MCO2 → Desmarque MCO → Pase MCO3 → Remate MCO4

### 1-4-4-1 · ataque por centro (34 jugadas)

 1. *build_central* — Pase MCD2 → Pase MCD3 → Desmarque MCO → Pase DC → Tiro DC
 2. *build_central* — Pase MCO3 → Pase MCO4 → Desmarque MCD → Pase DC → Tiro MCD3
 3. *build_paciente* — Pase MCD4 → Pase MCO2 → Pase MCO3 → Desmarque DC → Tiro DC
 4. *build_paciente* — Pase MCD → Pase MCD4 → Pase MCO → Desmarque DC → Tiro MCO
 5. *switch_play* — Pase MCO2 → Pase MCD → Regate MCD4 → Pase MCD3 → Remate DC
 6. *switch_play* — Pase MCD3 → Pase MCO3 → Regate DC → Pase MCO2 → Remate MCD2
 7. *switch_play* — Pase MCO4 → Pase MCD4 → Regate MCO → Pase MCO3 → Remate DC
 8. *wing_overlap* — Pase MCO → Regate DC → Pase DFI → Pase MCD2 → Remate DC
 9. *wing_overlap* — Pase MCD2 → Regate MCO → Pase DFI → Pase MCO3 → Remate MCD3
10. *wing_overlap* — Pase MCO3 → Regate MCD → Pase DFI → Pase MCD3 → Remate DC
11. *wing_cutback* — Pase MCD4 → Regate MCO2 → Desmarque MCO3 → Pase MCO4 → Tiro DC
12. *wing_cutback* — Pase MCD → Regate MCD2 → Desmarque MCD4 → Pase MCO → Tiro MCD4
13. *wing_cutback* — Pase MCO2 → Regate MCO3 → Desmarque DC → Pase MCD → Tiro DC
14. *through_ball* — Pase MCD3 → Pase MCO → Desmarque MCO2 → Desmarque DC → Tiro DC
15. *through_ball* — Pase MCO4 → Pase MCD2 → Desmarque MCD4 → Desmarque DC → Tiro MCD4
16. *give_and_go* — Pase MCO → Pase DC → Desmarque MCO3 → Pase DC → Tiro DC
17. *give_and_go* — Pase MCD2 → Pase DC → Desmarque MCD4 → Pase DC → Tiro MCO2
18. *counter* — Pase MCO3 → Regate MCO → Pase MCD4 → Desmarque DC → Tiro DC
19. *counter* — Pase MCD4 → Regate MCD → Pase MCD3 → Desmarque DC → Tiro MCO4
20. *counter* — Pase MCD → Regate MCO2 → Pase MCO4 → Desmarque DC → Tiro DC
21. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
22. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate MCO3
23. *long_shot* — Pase MCO4 → Regate MCD → Tiro DC
24. *long_shot* — Pase MCD3 → Regate MCD4 → Tiro MCO
25. *solo_run* — Regate MCO2 → Regate DC → Regate DC → Tiro DC
26. *solo_run* — Regate MCD2 → Regate MCD4 → Regate DC → Tiro MCO
27. *overload* — Pase MCO2 → Desmarque DFI → Pase MCO4 → Desmarque DC → Remate DC
28. *overload* — Pase MCD3 → Desmarque DFI → Pase MCO → Desmarque DC → Remate MCO3
29. *overload* — Pase MCO4 → Desmarque DFI → Pase MCD2 → Desmarque DC → Remate DC
30. *third_man* — Pase MCO → Pase MCD → Pase MCD3 → Desmarque DC → Tiro DC
31. *third_man* — Pase MCD2 → Pase MCO3 → Pase MCO4 → Desmarque DC → Tiro MCO2
32. *carrilero_run* — Pase MCO3 → Desmarque MCD4 → Pase MCO2 → Remate DC
33. *carrilero_run* — Pase MCD3 → Desmarque MCD → Pase MCD3 → Remate MCD4
34. *carrilero_run* — Pase MCO3 → Desmarque MCO → Pase MCO3 → Remate DC

### 1-4-4-1 · ataque por derecha (34 jugadas)

 1. *build_central* — Pase MCD3 → Pase MCD2 → Desmarque MCO2 → Pase DC → Tiro DC
 2. *build_central* — Pase MCO4 → Pase MCO3 → Desmarque MCD2 → Pase DC → Tiro DC
 3. *build_paciente* — Pase MCO → Pase MCO2 → Pase MCO3 → Desmarque DC → Tiro DC
 4. *build_paciente* — Pase MCD2 → Pase MCD4 → Pase MCO → Desmarque DC → Tiro DC
 5. *switch_play* — Pase MCO3 → Pase MCD → Regate MCD3 → Pase MCD4 → Remate DC
 6. *switch_play* — Pase MCD4 → Pase MCO3 → Regate MCO4 → Pase MCD → Remate DC
 7. *switch_play* — Pase MCD → Pase MCO → Regate MCD4 → Pase MCO3 → Remate MCO4
 8. *wing_overlap* — Pase MCO2 → Regate MCO4 → Pase DFI → Pase MCD → Remate DC
 9. *wing_overlap* — Pase MCD3 → Regate MCD4 → Pase DFI → Pase MCO2 → Remate DC
10. *wing_overlap* — Pase MCO4 → Regate DC → Pase DFI → Pase MCD2 → Remate MCD
11. *wing_cutback* — Pase MCO → Regate MCO → Desmarque MCO4 → Pase DC → Tiro DC
12. *wing_cutback* — Pase MCD2 → Regate MCD → Desmarque MCO → Pase MCO2 → Tiro DC
13. *wing_cutback* — Pase MCO3 → Regate MCO2 → Desmarque MCD → Pase MCD3 → Tiro MCD2
14. *through_ball* — Pase MCD4 → Pase MCO → Desmarque MCO2 → Desmarque DC → Tiro DC
15. *through_ball* — Pase MCD → Pase MCD3 → Desmarque MCD4 → Desmarque DC → Tiro DC
16. *give_and_go* — Pase MCO2 → Pase DC → Desmarque MCO4 → Pase DC → Tiro DC
17. *give_and_go* — Pase MCD3 → Pase DC → Desmarque MCO → Pase DC → Tiro DC
18. *counter* — Pase MCO4 → Regate MCD4 → Pase MCO → Desmarque DC → Tiro DC
19. *counter* — Pase MCO → Regate DC → Pase MCO3 → Desmarque DC → Tiro DC
20. *counter* — Pase MCD2 → Regate MCO → Pase MCO4 → Desmarque DC → Tiro MCO2
21. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
22. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
23. *long_shot* — Pase MCD → Regate MCD2 → Tiro DC
24. *long_shot* — Pase MCD4 → Regate MCO → Tiro DC
25. *solo_run* — Regate MCO3 → Regate MCO4 → Regate DC → Tiro DC
26. *solo_run* — Regate MCD3 → Regate MCD3 → Regate DC → Tiro DC
27. *overload* — Pase MCO3 → Desmarque DFI → Pase MCD → Desmarque DC → Remate DC
28. *overload* — Pase MCD4 → Desmarque DFI → Pase MCO2 → Desmarque DC → Remate DC
29. *overload* — Pase MCD → Desmarque DFI → Pase MCD3 → Desmarque DC → Remate MCO
30. *third_man* — Pase MCO2 → Pase MCD → Pase MCD3 → Desmarque DC → Tiro DC
31. *third_man* — Pase MCD3 → Pase MCO3 → Pase MCO4 → Desmarque DC → Tiro DC
32. *carrilero_run* — Pase MCO4 → Desmarque MCD4 → Pase MCO2 → Remate DC
33. *carrilero_run* — Pase MCD4 → Desmarque MCD → Pase MCD3 → Remate DC
34. *carrilero_run* — Pase MCO4 → Desmarque MCO → Pase MCO3 → Remate MCO4

## 1-4-1-3-1
*93 jugadas de campo · izquierda 31 · centro 31 · derecha 31*

**Dibujo (posiciones de campo):** Defensa: DFI  |  Mediocampo: MCD · MCD2 · MCD3 · MCD4 · MC · MI · MCO · MD  |  Ataque: DC

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **DC** (Delantero centro): Desmarque ×48, Tiro ×47, Remate ×26, Pase ×24, Regate ×6 · ⚽×73
- **MCD3** (Pivote): Pase ×32, Desmarque ×10, Regate ×1
- **MCD** (Pivote): Pase ×29, Regate ×8, Desmarque ×4
- **MCO** (Mediapunta): Pase ×27, Regate ×3, Tiro ×3 · ⚽×3
- **MD** (Medio derecho): Pase ×14, Regate ×13, Desmarque ×3, Tiro ×2, Remate ×1 · ⚽×3
- **MI** (Medio izquierdo): Pase ×14, Regate ×13, Desmarque ×3, Tiro ×2, Remate ×1 · ⚽×3
- **MCD2** (Pivote): Pase ×17, Desmarque ×5, Regate ×3, Tiro ×2, Remate ×1 · ⚽×3
- **MCD4** (Pivote): Pase ×13, Regate ×6, Desmarque ×5, Tiro ×3 · ⚽×3
- **MC** (Mediocentro): Pase ×19, Remate ×4, Tiro ×1, Regate ×1 · ⚽×5
- **DFI** (Central izquierdo): Pase ×12, Desmarque ×6

### 1-4-1-3-1 · ataque por izquierda (31 jugadas)

 1. *build_central* — Pase MCD → Pase MCD3 → Desmarque MCD4 → Pase DC → Tiro DC
 2. *build_central* — Pase MCO → Pase MCD2 → Desmarque MCD3 → Pase DC → Tiro DC
 3. *build_paciente* — Pase MC → Pase MI → Pase MCD → Desmarque DC → Tiro DC
 4. *build_paciente* — Pase MCD4 → Pase MI → Pase MCO → Desmarque DC → Tiro DC
 5. *switch_play* — Pase MCD3 → Pase MD → Regate MI → Pase MCD3 → Remate DC
 6. *switch_play* — Pase MCD2 → Pase MD → Regate MI → Pase MCD → Remate DC
 7. *wing_overlap* — Pase MCD → Regate MI → Pase DFI → Pase MI → Remate DC
 8. *wing_overlap* — Pase MCO → Regate MI → Pase DFI → Pase MI → Remate DC
 9. *wing_cutback* — Pase MI → Regate MI → Desmarque MCD3 → Pase MI → Tiro DC
10. *wing_cutback* — Pase MI → Regate MI → Desmarque DC → Pase MI → Tiro DC
11. *through_ball* — Pase MCD3 → Pase MCD2 → Desmarque MCD4 → Desmarque DC → Tiro DC
12. *through_ball* — Pase MCD2 → Pase MCD3 → Desmarque MCD4 → Desmarque DC → Tiro DC
13. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD3 → Pase DC → Tiro DC
14. *give_and_go* — Pase MCO → Pase DC → Desmarque MCD2 → Pase DC → Tiro DC
15. *counter* — Pase MC → Regate MI → Pase MCD → Desmarque DC → Tiro DC
16. *counter* — Pase MCD4 → Regate MI → Pase MCO → Desmarque DC → Tiro DC
17. *counter* — Pase MCD3 → Regate MI → Pase MC → Desmarque DC → Tiro MI
18. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
19. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
20. *long_shot* — Pase MCO → Regate MCD → Tiro DC
21. *long_shot* — Pase MCD3 → Regate MCD4 → Tiro DC
22. *long_shot* — Pase MCO → Regate MCD → Tiro MI
23. *solo_run* — Regate MI → Regate MI → Regate DC → Tiro DC
24. *solo_run* — Regate MI → Regate MI → Regate DC → Tiro DC
25. *overload* — Pase MI → Desmarque DFI → Pase MCD → Desmarque DC → Remate DC
26. *overload* — Pase MI → Desmarque DFI → Pase MCO → Desmarque DC → Remate DC
27. *third_man* — Pase MCD3 → Pase MC → Pase MI → Desmarque DC → Tiro DC
28. *third_man* — Pase MCD2 → Pase MC → Pase MI → Desmarque DC → Tiro DC
29. *carrilero_run* — Pase MCD → Desmarque MI → Pase MCD2 → Remate DC
30. *carrilero_run* — Pase MC → Desmarque MI → Pase MCO → Remate DC
31. *carrilero_run* — Pase MCD3 → Desmarque MI → Pase MCD3 → Remate MI

### 1-4-1-3-1 · ataque por centro (31 jugadas)

 1. *build_central* — Pase MCD → Pase MCD2 → Desmarque MCD4 → Pase DC → Tiro DC
 2. *build_central* — Pase MCO → Pase MCD → Desmarque MCD3 → Pase DC → Tiro MCD4
 3. *build_paciente* — Pase MC → Pase MCD → Pase MCD3 → Desmarque DC → Tiro DC
 4. *build_paciente* — Pase MCD4 → Pase MCD → Pase MCD3 → Desmarque DC → Tiro MCD2
 5. *switch_play* — Pase MCD3 → Pase MCD → Regate MCO → Pase MCD3 → Remate DC
 6. *switch_play* — Pase MCD2 → Pase MCD → Regate MCD4 → Pase MCD3 → Remate MC
 7. *wing_overlap* — Pase MCD → Regate MCD → Pase DFI → Pase MCD3 → Remate DC
 8. *wing_overlap* — Pase MCO → Regate MCO → Pase DFI → Pase MCD → Remate MC
 9. *wing_cutback* — Pase MC → Regate MCD4 → Desmarque MCD → Pase MCD3 → Tiro DC
10. *wing_cutback* — Pase MCD4 → Regate MCD2 → Desmarque DC → Pase MCD → Tiro MC
11. *through_ball* — Pase MCD3 → Pase MCD → Desmarque MCD3 → Desmarque DC → Tiro DC
12. *through_ball* — Pase MCD2 → Pase MCD → Desmarque MCD3 → Desmarque DC → Tiro MCO
13. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD3 → Pase DC → Tiro DC
14. *give_and_go* — Pase MCO → Pase DC → Desmarque MCD2 → Pase DC → Tiro MCD4
15. *counter* — Pase MC → Regate MCO → Pase MCD2 → Desmarque DC → Tiro DC
16. *counter* — Pase MCD4 → Regate MCD4 → Pase MCD2 → Desmarque DC → Tiro MCD2
17. *counter* — Pase MCD3 → Regate MCD2 → Pase MCD3 → Desmarque DC → Tiro DC
18. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
19. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate MC
20. *long_shot* — Pase MCO → Regate MCD → Tiro DC
21. *long_shot* — Pase MCD3 → Regate MCD4 → Tiro MCO
22. *long_shot* — Pase MCO → Regate MCD → Tiro DC
23. *solo_run* — Regate MCD3 → Regate MC → Regate DC → Tiro DC
24. *solo_run* — Regate MCD → Regate MCD2 → Regate DC → Tiro MCD4
25. *overload* — Pase MC → Desmarque DFI → Pase MCD → Desmarque DC → Remate DC
26. *overload* — Pase MCD4 → Desmarque DFI → Pase MCO → Desmarque DC → Remate MCD2
27. *third_man* — Pase MCD3 → Pase MCD4 → Pase MC → Desmarque DC → Tiro DC
28. *third_man* — Pase MCD2 → Pase MCD4 → Pase MC → Desmarque DC → Tiro MCO
29. *carrilero_run* — Pase MCD → Desmarque MCD4 → Pase MC → Remate DC
30. *carrilero_run* — Pase MC → Desmarque MCD2 → Pase MCD4 → Remate MC
31. *carrilero_run* — Pase MCD3 → Desmarque MCD → Pase MCD3 → Remate DC

### 1-4-1-3-1 · ataque por derecha (31 jugadas)

 1. *build_central* — Pase MCD → Pase MCO → Desmarque MCD3 → Pase DC → Tiro DC
 2. *build_central* — Pase MCO → Pase MC → Desmarque MCD2 → Pase DC → Tiro DC
 3. *build_paciente* — Pase MC → Pase MD → Pase MCD → Desmarque DC → Tiro DC
 4. *build_paciente* — Pase MCD4 → Pase MD → Pase MCO → Desmarque DC → Tiro DC
 5. *switch_play* — Pase MCD3 → Pase MI → Regate MD → Pase MCD4 → Remate DC
 6. *switch_play* — Pase MCD2 → Pase MI → Regate MD → Pase MCD2 → Remate DC
 7. *wing_overlap* — Pase MCD → Regate MD → Pase DFI → Pase MD → Remate DC
 8. *wing_overlap* — Pase MCO → Regate MD → Pase DFI → Pase MD → Remate DC
 9. *wing_cutback* — Pase MD → Regate MD → Desmarque MCD3 → Pase MD → Tiro DC
10. *wing_cutback* — Pase MD → Regate MD → Desmarque DC → Pase MD → Tiro DC
11. *through_ball* — Pase MCD3 → Pase MCO → Desmarque MCD → Desmarque DC → Tiro DC
12. *through_ball* — Pase MCD2 → Pase MCO → Desmarque MCD → Desmarque DC → Tiro DC
13. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD3 → Pase DC → Tiro DC
14. *give_and_go* — Pase MCO → Pase DC → Desmarque MCD2 → Pase DC → Tiro DC
15. *counter* — Pase MC → Regate MD → Pase MCD → Desmarque DC → Tiro DC
16. *counter* — Pase MCD4 → Regate MD → Pase MCO → Desmarque DC → Tiro DC
17. *counter* — Pase MCD3 → Regate MD → Pase MC → Desmarque DC → Tiro MD
18. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
19. *long_ball* — Pase DFI → Desmarque DC → Pase DC → Desmarque DC → Remate DC
20. *long_shot* — Pase MCO → Regate MCD → Tiro DC
21. *long_shot* — Pase MCD3 → Regate MCD4 → Tiro DC
22. *long_shot* — Pase MCO → Regate MCD → Tiro MD
23. *solo_run* — Regate MD → Regate MD → Regate DC → Tiro DC
24. *solo_run* — Regate MD → Regate MD → Regate DC → Tiro DC
25. *overload* — Pase MD → Desmarque DFI → Pase MCD → Desmarque DC → Remate DC
26. *overload* — Pase MD → Desmarque DFI → Pase MCO → Desmarque DC → Remate DC
27. *third_man* — Pase MCD3 → Pase MCD2 → Pase MD → Desmarque DC → Tiro DC
28. *third_man* — Pase MCD2 → Pase MCD3 → Pase MD → Desmarque DC → Tiro DC
29. *carrilero_run* — Pase MCD → Desmarque MD → Pase MCD3 → Remate DC
30. *carrilero_run* — Pase MC → Desmarque MD → Pase MCO → Remate DC
31. *carrilero_run* — Pase MCD3 → Desmarque MD → Pase MCD4 → Remate MD

## 3-1-2-1-3
*102 jugadas de campo · izquierda 34 · centro 34 · derecha 34*

**Dibujo (posiciones de campo):** Defensa: DFI · DFC · DFD  |  Mediocampo: MCD · MI · MD · MCO  |  Ataque: SDI · DC · SDD

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **MCD** (Pivote): Pase ×61, Desmarque ×12, Regate ×8, Tiro ×5, Remate ×4 · ⚽×9
- **DC** (Delantero centro): Desmarque ×39, Pase ×18, Remate ×13, Tiro ×11, Regate ×8 · ⚽×24
- **MCO** (Mediapunta): Pase ×65, Regate ×10, Desmarque ×8, Tiro ×4, Remate ×2 · ⚽×6
- **SDD** (Delantero/extremo derecho): Tiro ×18, Remate ×10, Regate ×8, Pase ×6, Desmarque ×6 · ⚽×28
- **SDI** (Delantero/extremo izquierdo): Tiro ×18, Pase ×9, Regate ×8, Desmarque ×6, Remate ×6 · ⚽×24
- **MD** (Medio derecho): Pase ×18, Regate ×12, Desmarque ×5, Remate ×4, Tiro ×2 · ⚽×6
- **MI** (Medio izquierdo): Pase ×19, Regate ×12, Desmarque ×5, Remate ×3, Tiro ×2 · ⚽×5
- **DFC** (Central): Pase ×20, Desmarque ×3
- **DFD** (Central derecho): Pase ×3, Desmarque ×3
- **DFI** (Central izquierdo): Pase ×3, Desmarque ×3

### 3-1-2-1-3 · ataque por izquierda (34 jugadas)

 1. *build_central* — Pase MCD → Pase MCO → Desmarque MCD → Pase DC → Tiro SDI
 2. *build_central* — Pase MCO → Pase MCD → Desmarque DC → Pase SDI → Tiro SDD
 3. *build_paciente* — Pase MCD → Pase MI → Pase MCD → Desmarque SDI → Tiro DC
 4. *build_paciente* — Pase DFC → Pase MI → Pase MCO → Desmarque SDI → Tiro SDD
 5. *switch_play* — Pase MCD → Pase MD → Regate MI → Pase MCO → Remate DC
 6. *switch_play* — Pase MCO → Pase MD → Regate SDI → Pase MI → Remate SDI
 7. *switch_play* — Pase MCD → Pase MD → Regate MI → Pase MCD → Remate MI
 8. *wing_overlap* — Pase MCO → Regate MI → Pase DFI → Pase MI → Remate DC
 9. *wing_overlap* — Pase MCD → Regate SDI → Pase DFI → Pase SDI → Remate DC
10. *wing_overlap* — Pase MCO → Regate MI → Pase DFI → Pase MI → Remate MD
11. *wing_cutback* — Pase MI → Regate SDI → Desmarque MI → Pase SDI → Tiro DC
12. *wing_cutback* — Pase MI → Regate MI → Desmarque SDI → Pase MI → Tiro SDI
13. *wing_cutback* — Pase MI → Regate SDI → Desmarque MI → Pase SDI → Tiro MI
14. *through_ball* — Pase MCO → Pase MCD → Desmarque MCO → Desmarque DC → Tiro SDD
15. *through_ball* — Pase MCD → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SDI
16. *give_and_go* — Pase MCO → Pase DC → Desmarque MCO → Pase DC → Tiro SDD
17. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD → Pase DC → Tiro SDI
18. *counter* — Pase MCD → Regate MI → Pase MCO → Desmarque DC → Tiro SDD
19. *counter* — Pase DFC → Regate SDI → Pase MCD → Desmarque DC → Tiro SDI
20. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
21. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate SDI
22. *long_shot* — Pase MCO → Regate MCD → Tiro DC
23. *long_shot* — Pase MCD → Regate MCO → Tiro SDI
24. *solo_run* — Regate MI → Regate MI → Regate SDI → Tiro DC
25. *solo_run* — Regate MI → Regate MI → Regate SDI → Tiro DC
26. *solo_run* — Regate MI → Regate MI → Regate SDI → Tiro MI
27. *overload* — Pase MI → Desmarque DFI → Pase MCO → Desmarque SDI → Remate DC
28. *overload* — Pase MI → Desmarque DFI → Pase MCD → Desmarque SDI → Remate DC
29. *overload* — Pase MI → Desmarque DFI → Pase MCO → Desmarque SDI → Remate MI
30. *third_man* — Pase DFC → Pase MCO → Pase MI → Desmarque DC → Tiro SDI
31. *third_man* — Pase MCO → Pase MCD → Pase MI → Desmarque DC → Tiro SDI
32. *carrilero_run* — Pase MCD → Desmarque MI → Pase MCD → Remate DC
33. *carrilero_run* — Pase MCO → Desmarque MI → Pase MD → Remate SDI
34. *carrilero_run* — Pase DFC → Desmarque MI → Pase MCO → Remate MI

### 3-1-2-1-3 · ataque por centro (34 jugadas)

 1. *build_central* — Pase MCD → Pase MCO → Desmarque MCD → Pase DC → Tiro SDI
 2. *build_central* — Pase MCO → Pase MCD → Desmarque DC → Pase SDI → Tiro MCO
 3. *build_paciente* — Pase MCO → Pase MCD → Pase MCO → Desmarque DC → Tiro SDI
 4. *build_paciente* — Pase MCD → Pase MCO → Pase MCD → Desmarque DC → Tiro MCO
 5. *switch_play* — Pase MCD → Pase MCO → Regate DC → Pase MCO → Remate DC
 6. *switch_play* — Pase MCO → Pase MCD → Regate MCO → Pase MCD → Remate MCO
 7. *switch_play* — Pase MCD → Pase MCO → Regate MCD → Pase MCO → Remate SDI
 8. *wing_overlap* — Pase MCO → Regate MCO → Pase DFC → Pase MCD → Remate DC
 9. *wing_overlap* — Pase MCD → Regate MCD → Pase DFC → Pase DC → Remate MCD
10. *wing_overlap* — Pase MCO → Regate DC → Pase DFC → Pase MCO → Remate SDD
11. *wing_cutback* — Pase MCD → Regate MCO → Desmarque MCD → Pase DC → Tiro SDI
12. *wing_cutback* — Pase MCO → Regate MCD → Desmarque DC → Pase MCD → Tiro MCO
13. *wing_cutback* — Pase MCD → Regate DC → Desmarque MCD → Pase DC → Tiro SDI
14. *through_ball* — Pase DFC → Pase MCD → Desmarque MCO → Desmarque DC → Tiro SDD
15. *through_ball* — Pase MCO → Pase MCD → Desmarque MCO → Desmarque DC → Tiro MCD
16. *give_and_go* — Pase MCO → Pase DC → Desmarque MCO → Pase DC → Tiro SDD
17. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD → Pase DC → Tiro MCD
18. *counter* — Pase MCO → Regate MCD → Pase MCO → Desmarque DC → Tiro SDD
19. *counter* — Pase MCD → Regate DC → Pase MCD → Desmarque DC → Tiro MCD
20. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
21. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate MCD
22. *long_shot* — Pase MCO → Regate MCD → Tiro DC
23. *long_shot* — Pase MCD → Regate MCO → Tiro MCD
24. *solo_run* — Regate MCO → Regate DC → Regate DC → Tiro SDI
25. *solo_run* — Regate MCO → Regate MCD → Regate DC → Tiro MCD
26. *solo_run* — Regate MCO → Regate MCO → Regate DC → Tiro SDI
27. *overload* — Pase MCO → Desmarque DFC → Pase MCO → Desmarque DC → Remate SDD
28. *overload* — Pase MCD → Desmarque DFC → Pase MCD → Desmarque DC → Remate MCD
29. *overload* — Pase MCO → Desmarque DFC → Pase MCO → Desmarque DC → Remate SDD
30. *third_man* — Pase MCD → Pase MCO → Pase MCD → Desmarque DC → Tiro SDI
31. *third_man* — Pase DFC → Pase MCD → Pase MCO → Desmarque DC → Tiro MCO
32. *carrilero_run* — Pase MCO → Desmarque MCD → Pase MCO → Remate DC
33. *carrilero_run* — Pase DFC → Desmarque MCO → Pase MCD → Remate MCO
34. *carrilero_run* — Pase MCD → Desmarque MCO → Pase MCD → Remate SDD

### 3-1-2-1-3 · ataque por derecha (34 jugadas)

 1. *build_central* — Pase MCD → Pase MCO → Desmarque MCD → Pase DC → Tiro SDI
 2. *build_central* — Pase MCO → Pase MCD → Desmarque DC → Pase SDI → Tiro SDD
 3. *build_paciente* — Pase DFC → Pase MD → Pase MCD → Desmarque SDD → Tiro DC
 4. *build_paciente* — Pase MCO → Pase MD → Pase MCO → Desmarque SDD → Tiro DC
 5. *switch_play* — Pase MCD → Pase MI → Regate MD → Pase MI → Remate DC
 6. *switch_play* — Pase MCO → Pase MI → Regate SDD → Pase MD → Remate SDD
 7. *switch_play* — Pase MCD → Pase MI → Regate MD → Pase MCO → Remate MD
 8. *wing_overlap* — Pase MCO → Regate MD → Pase DFD → Pase MD → Remate DC
 9. *wing_overlap* — Pase MCD → Regate SDD → Pase DFD → Pase SDD → Remate SDI
10. *wing_overlap* — Pase MCO → Regate MD → Pase DFD → Pase MD → Remate MCD
11. *wing_cutback* — Pase MD → Regate SDD → Desmarque MD → Pase SDD → Tiro DC
12. *wing_cutback* — Pase MD → Regate MD → Desmarque SDD → Pase MD → Tiro SDD
13. *wing_cutback* — Pase MD → Regate SDD → Desmarque MD → Pase SDD → Tiro MD
14. *through_ball* — Pase MCD → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SDD
15. *through_ball* — Pase DFC → Pase MCO → Desmarque MCD → Desmarque DC → Tiro SDD
16. *give_and_go* — Pase MCO → Pase DC → Desmarque MCO → Pase DC → Tiro SDD
17. *give_and_go* — Pase MCD → Pase DC → Desmarque MCD → Pase DC → Tiro SDD
18. *counter* — Pase DFC → Regate MD → Pase MCO → Desmarque DC → Tiro SDD
19. *counter* — Pase MCO → Regate SDD → Pase MCD → Desmarque DC → Tiro SDD
20. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
21. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate SDD
22. *long_shot* — Pase MCO → Regate MCD → Tiro DC
23. *long_shot* — Pase MCD → Regate MCO → Tiro SDD
24. *solo_run* — Regate MD → Regate MD → Regate SDD → Tiro DC
25. *solo_run* — Regate MD → Regate MD → Regate SDD → Tiro SDI
26. *solo_run* — Regate MD → Regate MD → Regate SDD → Tiro MD
27. *overload* — Pase MD → Desmarque DFD → Pase MCO → Desmarque SDD → Remate DC
28. *overload* — Pase MD → Desmarque DFD → Pase MCD → Desmarque SDD → Remate SDI
29. *overload* — Pase MD → Desmarque DFD → Pase MCO → Desmarque SDD → Remate MD
30. *third_man* — Pase MCO → Pase MCD → Pase MD → Desmarque DC → Tiro SDI
31. *third_man* — Pase MCD → Pase MCO → Pase MD → Desmarque DC → Tiro SDD
32. *carrilero_run* — Pase DFC → Desmarque MD → Pase MCO → Remate DC
33. *carrilero_run* — Pase MCD → Desmarque MD → Pase MCD → Remate SDD
34. *carrilero_run* — Pase MCO → Desmarque MD → Pase MI → Remate MD

## wm-3-2-5
*102 jugadas de campo · izquierda 34 · centro 34 · derecha 34*

**Dibujo (posiciones de campo):** Defensa: DFI · DFC · DFD  |  Mediocampo: MI · MD  |  Ataque: SDI · DC · SDD

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **MD** (Medio derecho): Pase ×67, Desmarque ×15, Regate ×13, Remate ×8, Tiro ×5 · ⚽×13
- **DC** (Delantero centro): Desmarque ×47, Pase ×18, Regate ×15, Tiro ×14, Remate ×12 · ⚽×26
- **MI** (Medio izquierdo): Pase ×71, Regate ×11, Desmarque ×11, Remate ×7, Tiro ×6 · ⚽×13
- **SDD** (Delantero/extremo derecho): Tiro ×21, Pase ×11, Remate ×10, Regate ×9, Desmarque ×7 · ⚽×31
- **DFC** (Central): Pase ×45, Desmarque ×3
- **SDI** (Delantero/extremo izquierdo): Tiro ×11, Pase ×10, Regate ×9, Remate ×8, Desmarque ×7 · ⚽×19
- **DFD** (Central derecho): Pase ×3, Desmarque ×3
- **DFI** (Central izquierdo): Pase ×3, Desmarque ×3

### wm-3-2-5 · ataque por izquierda (34 jugadas)

 1. *build_central* — Pase MI → Pase MD → Desmarque DC → Pase SDD → Tiro DC
 2. *build_central* — Pase MD → Pase MI → Desmarque DC → Pase SDI → Tiro SDD
 3. *build_paciente* — Pase DFC → Pase MI → Pase MD → Desmarque SDI → Tiro DC
 4. *build_paciente* — Pase DFC → Pase MI → Pase MD → Desmarque SDI → Tiro SDD
 5. *switch_play* — Pase MI → Pase MD → Regate MI → Pase MD → Remate DC
 6. *switch_play* — Pase MD → Pase MI → Regate SDI → Pase MI → Remate SDI
 7. *switch_play* — Pase MI → Pase MD → Regate MI → Pase MD → Remate MI
 8. *wing_overlap* — Pase MD → Regate MI → Pase DFI → Pase MI → Remate DC
 9. *wing_overlap* — Pase MI → Regate SDI → Pase DFI → Pase SDI → Remate DC
10. *wing_overlap* — Pase MD → Regate MI → Pase DFI → Pase MI → Remate MD
11. *wing_cutback* — Pase MI → Regate SDI → Desmarque MI → Pase SDI → Tiro DC
12. *wing_cutback* — Pase MI → Regate MI → Desmarque SDI → Pase MI → Tiro SDI
13. *wing_cutback* — Pase MI → Regate SDI → Desmarque MI → Pase SDI → Tiro MI
14. *through_ball* — Pase DFC → Pase MI → Desmarque MD → Desmarque DC → Tiro SDD
15. *through_ball* — Pase DFC → Pase MD → Desmarque MI → Desmarque DC → Tiro SDI
16. *give_and_go* — Pase MD → Pase DC → Desmarque MD → Pase DC → Tiro SDD
17. *give_and_go* — Pase MI → Pase DC → Desmarque MI → Pase DC → Tiro SDI
18. *counter* — Pase DFC → Regate MI → Pase MD → Desmarque DC → Tiro SDD
19. *counter* — Pase DFC → Regate SDI → Pase MI → Desmarque DC → Tiro SDI
20. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
21. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate SDI
22. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate MI
23. *long_shot* — Pase MI → Regate MD → Tiro DC
24. *long_shot* — Pase MD → Regate MI → Tiro SDI
25. *solo_run* — Regate MI → Regate SDI → Regate SDI → Tiro DC
26. *solo_run* — Regate MI → Regate SDI → Regate SDI → Tiro SDD
27. *overload* — Pase MI → Desmarque DFI → Pase MI → Desmarque SDI → Remate DC
28. *overload* — Pase MI → Desmarque DFI → Pase MD → Desmarque SDI → Remate SDD
29. *overload* — Pase MI → Desmarque DFI → Pase MI → Desmarque SDI → Remate MI
30. *third_man* — Pase DFC → Pase MI → Pase MD → Desmarque DC → Tiro SDD
31. *third_man* — Pase DFC → Pase MD → Pase MI → Desmarque DC → Tiro SDI
32. *carrilero_run* — Pase DFC → Desmarque MI → Pase MD → Remate DC
33. *carrilero_run* — Pase DFC → Desmarque MI → Pase MD → Remate SDI
34. *carrilero_run* — Pase DFC → Desmarque MI → Pase MD → Remate MI

### wm-3-2-5 · ataque por centro (34 jugadas)

 1. *build_central* — Pase MD → Pase MI → Desmarque DC → Pase SDI → Tiro DC
 2. *build_central* — Pase MI → Pase MD → Desmarque DC → Pase SDD → Tiro MI
 3. *build_paciente* — Pase DFC → Pase MI → Pase MD → Desmarque DC → Tiro SDD
 4. *build_paciente* — Pase DFC → Pase MD → Pase MI → Desmarque DC → Tiro MI
 5. *switch_play* — Pase MD → Pase MI → Regate DC → Pase MI → Remate DC
 6. *switch_play* — Pase MI → Pase MD → Regate DC → Pase MD → Remate MI
 7. *switch_play* — Pase MD → Pase MI → Regate DC → Pase MI → Remate SDD
 8. *wing_overlap* — Pase MI → Regate DC → Pase DFC → Pase DC → Remate SDI
 9. *wing_overlap* — Pase MD → Regate DC → Pase DFC → Pase DC → Remate MD
10. *wing_overlap* — Pase MI → Regate DC → Pase DFC → Pase DC → Remate SDI
11. *wing_cutback* — Pase MD → Regate DC → Desmarque MD → Pase DC → Tiro SDD
12. *wing_cutback* — Pase MI → Regate DC → Desmarque SDI → Pase DC → Tiro MI
13. *wing_cutback* — Pase MD → Regate DC → Desmarque SDD → Pase DC → Tiro SDD
14. *through_ball* — Pase DFC → Pase MD → Desmarque MI → Desmarque DC → Tiro SDI
15. *through_ball* — Pase DFC → Pase MI → Desmarque MD → Desmarque DC → Tiro MD
16. *give_and_go* — Pase MI → Pase DC → Desmarque MI → Pase DC → Tiro SDI
17. *give_and_go* — Pase MD → Pase DC → Desmarque MD → Pase DC → Tiro MD
18. *counter* — Pase DFC → Regate DC → Pase MI → Desmarque DC → Tiro SDI
19. *counter* — Pase DFC → Regate DC → Pase MD → Desmarque DC → Tiro MD
20. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate SDI
21. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate MD
22. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate SDI
23. *long_shot* — Pase MD → Regate MI → Tiro DC
24. *long_shot* — Pase MI → Regate MD → Tiro MI
25. *solo_run* — Regate MD → Regate DC → Regate DC → Tiro SDI
26. *solo_run* — Regate MD → Regate DC → Regate DC → Tiro MI
27. *overload* — Pase MD → Desmarque DFC → Pase MD → Desmarque DC → Remate SDD
28. *overload* — Pase MI → Desmarque DFC → Pase MI → Desmarque DC → Remate MI
29. *overload* — Pase MD → Desmarque DFC → Pase MD → Desmarque DC → Remate SDD
30. *third_man* — Pase DFC → Pase MD → Pase MI → Desmarque DC → Tiro SDI
31. *third_man* — Pase DFC → Pase MI → Pase MD → Desmarque DC → Tiro MD
32. *carrilero_run* — Pase DFC → Desmarque MD → Pase MI → Remate DC
33. *carrilero_run* — Pase DFC → Desmarque MD → Pase MI → Remate MD
34. *carrilero_run* — Pase DFC → Desmarque MD → Pase MI → Remate SDD

### wm-3-2-5 · ataque por derecha (34 jugadas)

 1. *build_central* — Pase MI → Pase MD → Desmarque DC → Pase SDD → Tiro DC
 2. *build_central* — Pase MD → Pase MI → Desmarque DC → Pase SDI → Tiro SDD
 3. *build_paciente* — Pase DFC → Pase MD → Pase MI → Desmarque SDD → Tiro DC
 4. *build_paciente* — Pase DFC → Pase MD → Pase MI → Desmarque SDD → Tiro DC
 5. *switch_play* — Pase MI → Pase MD → Regate MD → Pase MI → Remate DC
 6. *switch_play* — Pase MD → Pase MI → Regate SDD → Pase MD → Remate SDD
 7. *switch_play* — Pase MI → Pase MD → Regate MD → Pase MI → Remate MD
 8. *wing_overlap* — Pase MD → Regate MD → Pase DFD → Pase MD → Remate DC
 9. *wing_overlap* — Pase MI → Regate SDD → Pase DFD → Pase SDD → Remate SDI
10. *wing_overlap* — Pase MD → Regate MD → Pase DFD → Pase MD → Remate MI
11. *wing_cutback* — Pase MD → Regate SDD → Desmarque MD → Pase SDD → Tiro DC
12. *wing_cutback* — Pase MD → Regate MD → Desmarque SDD → Pase MD → Tiro SDD
13. *wing_cutback* — Pase MD → Regate SDD → Desmarque MD → Pase SDD → Tiro MD
14. *through_ball* — Pase DFC → Pase MI → Desmarque MD → Desmarque DC → Tiro SDD
15. *through_ball* — Pase DFC → Pase MD → Desmarque MI → Desmarque DC → Tiro SDD
16. *give_and_go* — Pase MD → Pase DC → Desmarque MD → Pase DC → Tiro SDD
17. *give_and_go* — Pase MI → Pase DC → Desmarque MI → Pase DC → Tiro SDD
18. *counter* — Pase DFC → Regate MD → Pase MI → Desmarque DC → Tiro SDD
19. *counter* — Pase DFC → Regate SDD → Pase MI → Desmarque DC → Tiro SDD
20. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
21. *long_ball* — Pase DFC → Desmarque DC → Pase SDI → Desmarque DC → Remate SDD
22. *long_ball* — Pase DFC → Desmarque DC → Pase SDD → Desmarque DC → Remate MD
23. *long_shot* — Pase MI → Regate MD → Tiro DC
24. *long_shot* — Pase MD → Regate MI → Tiro SDD
25. *solo_run* — Regate MD → Regate SDD → Regate SDD → Tiro DC
26. *solo_run* — Regate MD → Regate SDD → Regate SDD → Tiro DC
27. *overload* — Pase MD → Desmarque DFD → Pase MI → Desmarque SDD → Remate DC
28. *overload* — Pase MD → Desmarque DFD → Pase MD → Desmarque SDD → Remate DC
29. *overload* — Pase MD → Desmarque DFD → Pase MI → Desmarque SDD → Remate MD
30. *third_man* — Pase DFC → Pase MI → Pase MD → Desmarque DC → Tiro SDD
31. *third_man* — Pase DFC → Pase MD → Pase MI → Desmarque DC → Tiro SDD
32. *carrilero_run* — Pase DFC → Desmarque MD → Pase MI → Remate DC
33. *carrilero_run* — Pase DFC → Desmarque MD → Pase MI → Remate SDD
34. *carrilero_run* — Pase DFC → Desmarque MD → Pase MI → Remate MD

## 4-2-4
*102 jugadas de campo · izquierda 34 · centro 34 · derecha 34*

**Dibujo (posiciones de campo):** Defensa: LI · DFI · DFD · LD  |  Mediocampo: MI · MD  |  Ataque: SDI · DC · SDD

**Posiciones y habilidades a priorizar** (nº de fases por habilidad; ⚽ = jugadas que finaliza):

- **MD** (Medio derecho): Pase ×67, Desmarque ×15, Regate ×13, Remate ×8, Tiro ×5 · ⚽×13
- **DC** (Delantero centro): Desmarque ×47, Pase ×18, Regate ×15, Tiro ×14, Remate ×12 · ⚽×26
- **MI** (Medio izquierdo): Pase ×71, Regate ×11, Desmarque ×11, Remate ×7, Tiro ×6 · ⚽×13
- **SDD** (Delantero/extremo derecho): Tiro ×21, Pase ×11, Remate ×10, Regate ×9, Desmarque ×7 · ⚽×31
- **SDI** (Delantero/extremo izquierdo): Tiro ×11, Pase ×10, Regate ×9, Remate ×8, Desmarque ×7 · ⚽×19
- **DFD** (Central derecho): Pase ×24, Desmarque ×1
- **DFI** (Central izquierdo): Pase ×21, Desmarque ×2
- **LD** (Lateral derecho): Pase ×3, Desmarque ×3
- **LI** (Lateral izquierdo): Pase ×3, Desmarque ×3

### 4-2-4 · ataque por izquierda (34 jugadas)

 1. *build_central* — Pase MI → Pase MD → Desmarque DC → Pase SDD → Tiro DC
 2. *build_central* — Pase MD → Pase MI → Desmarque DC → Pase SDI → Tiro SDD
 3. *build_paciente* — Pase DFI → Pase MI → Pase MD → Desmarque SDI → Tiro DC
 4. *build_paciente* — Pase DFD → Pase MI → Pase MD → Desmarque SDI → Tiro SDD
 5. *switch_play* — Pase MI → Pase MD → Regate MI → Pase MD → Remate DC
 6. *switch_play* — Pase MD → Pase MI → Regate SDI → Pase MI → Remate SDI
 7. *switch_play* — Pase MI → Pase MD → Regate MI → Pase MD → Remate MI
 8. *wing_overlap* — Pase MD → Regate MI → Pase LI → Pase MI → Remate DC
 9. *wing_overlap* — Pase MI → Regate SDI → Pase LI → Pase SDI → Remate DC
10. *wing_overlap* — Pase MD → Regate MI → Pase LI → Pase MI → Remate MD
11. *wing_cutback* — Pase MI → Regate SDI → Desmarque MI → Pase SDI → Tiro DC
12. *wing_cutback* — Pase MI → Regate MI → Desmarque SDI → Pase MI → Tiro SDI
13. *wing_cutback* — Pase MI → Regate SDI → Desmarque MI → Pase SDI → Tiro MI
14. *through_ball* — Pase DFD → Pase MI → Desmarque MD → Desmarque DC → Tiro SDD
15. *through_ball* — Pase DFI → Pase MD → Desmarque MI → Desmarque DC → Tiro SDI
16. *give_and_go* — Pase MD → Pase DC → Desmarque MD → Pase DC → Tiro SDD
17. *give_and_go* — Pase MI → Pase DC → Desmarque MI → Pase DC → Tiro SDI
18. *counter* — Pase DFD → Regate MI → Pase MD → Desmarque DC → Tiro SDD
19. *counter* — Pase DFI → Regate SDI → Pase MI → Desmarque DC → Tiro SDI
20. *long_ball* — Pase DFD → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
21. *long_ball* — Pase DFI → Desmarque DC → Pase SDI → Desmarque DC → Remate SDI
22. *long_ball* — Pase DFD → Desmarque DC → Pase SDD → Desmarque DC → Remate MI
23. *long_shot* — Pase MI → Regate MD → Tiro DC
24. *long_shot* — Pase MD → Regate MI → Tiro SDI
25. *solo_run* — Regate MI → Regate SDI → Regate SDI → Tiro DC
26. *solo_run* — Regate MI → Regate SDI → Regate SDI → Tiro SDD
27. *overload* — Pase MI → Desmarque LI → Pase MI → Desmarque SDI → Remate DC
28. *overload* — Pase MI → Desmarque LI → Pase MD → Desmarque SDI → Remate SDD
29. *overload* — Pase MI → Desmarque LI → Pase MI → Desmarque SDI → Remate MI
30. *third_man* — Pase DFD → Pase MI → Pase MD → Desmarque DC → Tiro SDD
31. *third_man* — Pase DFI → Pase MD → Pase MI → Desmarque DC → Tiro SDI
32. *carrilero_run* — Pase DFD → Desmarque MI → Pase MD → Remate DC
33. *carrilero_run* — Pase DFD → Desmarque MI → Pase MD → Remate SDI
34. *carrilero_run* — Pase DFD → Desmarque MI → Pase MD → Remate MI

### 4-2-4 · ataque por centro (34 jugadas)

 1. *build_central* — Pase MD → Pase MI → Desmarque DC → Pase SDI → Tiro DC
 2. *build_central* — Pase MI → Pase MD → Desmarque DC → Pase SDD → Tiro MI
 3. *build_paciente* — Pase DFD → Pase MI → Pase MD → Desmarque DC → Tiro SDD
 4. *build_paciente* — Pase DFI → Pase MD → Pase MI → Desmarque DC → Tiro MI
 5. *switch_play* — Pase MD → Pase MI → Regate DC → Pase MI → Remate DC
 6. *switch_play* — Pase MI → Pase MD → Regate DC → Pase MD → Remate MI
 7. *switch_play* — Pase MD → Pase MI → Regate DC → Pase MI → Remate SDD
 8. *wing_overlap* — Pase MI → Regate DC → Pase DFI → Pase DC → Remate SDI
 9. *wing_overlap* — Pase MD → Regate DC → Pase DFD → Pase DC → Remate MD
10. *wing_overlap* — Pase MI → Regate DC → Pase DFI → Pase DC → Remate SDI
11. *wing_cutback* — Pase MD → Regate DC → Desmarque MD → Pase DC → Tiro SDD
12. *wing_cutback* — Pase MI → Regate DC → Desmarque SDI → Pase DC → Tiro MI
13. *wing_cutback* — Pase MD → Regate DC → Desmarque SDD → Pase DC → Tiro SDD
14. *through_ball* — Pase DFI → Pase MD → Desmarque MI → Desmarque DC → Tiro SDI
15. *through_ball* — Pase DFD → Pase MI → Desmarque MD → Desmarque DC → Tiro MD
16. *give_and_go* — Pase MI → Pase DC → Desmarque MI → Pase DC → Tiro SDI
17. *give_and_go* — Pase MD → Pase DC → Desmarque MD → Pase DC → Tiro MD
18. *counter* — Pase DFI → Regate DC → Pase MI → Desmarque DC → Tiro SDI
19. *counter* — Pase DFD → Regate DC → Pase MD → Desmarque DC → Tiro MD
20. *long_ball* — Pase DFI → Desmarque DC → Pase SDI → Desmarque DC → Remate SDI
21. *long_ball* — Pase DFD → Desmarque DC → Pase SDD → Desmarque DC → Remate MD
22. *long_ball* — Pase DFI → Desmarque DC → Pase SDI → Desmarque DC → Remate SDI
23. *long_shot* — Pase MD → Regate MI → Tiro DC
24. *long_shot* — Pase MI → Regate MD → Tiro MI
25. *solo_run* — Regate MD → Regate DC → Regate DC → Tiro SDI
26. *solo_run* — Regate MD → Regate DC → Regate DC → Tiro MI
27. *overload* — Pase MD → Desmarque DFI → Pase MD → Desmarque DC → Remate SDD
28. *overload* — Pase MI → Desmarque DFD → Pase MI → Desmarque DC → Remate MI
29. *overload* — Pase MD → Desmarque DFI → Pase MD → Desmarque DC → Remate SDD
30. *third_man* — Pase DFI → Pase MD → Pase MI → Desmarque DC → Tiro SDI
31. *third_man* — Pase DFD → Pase MI → Pase MD → Desmarque DC → Tiro MD
32. *carrilero_run* — Pase DFI → Desmarque MD → Pase MI → Remate DC
33. *carrilero_run* — Pase DFI → Desmarque MD → Pase MI → Remate MD
34. *carrilero_run* — Pase DFI → Desmarque MD → Pase MI → Remate SDD

### 4-2-4 · ataque por derecha (34 jugadas)

 1. *build_central* — Pase MI → Pase MD → Desmarque DC → Pase SDD → Tiro DC
 2. *build_central* — Pase MD → Pase MI → Desmarque DC → Pase SDI → Tiro SDD
 3. *build_paciente* — Pase DFI → Pase MD → Pase MI → Desmarque SDD → Tiro DC
 4. *build_paciente* — Pase DFD → Pase MD → Pase MI → Desmarque SDD → Tiro DC
 5. *switch_play* — Pase MI → Pase MD → Regate MD → Pase MI → Remate DC
 6. *switch_play* — Pase MD → Pase MI → Regate SDD → Pase MD → Remate SDD
 7. *switch_play* — Pase MI → Pase MD → Regate MD → Pase MI → Remate MD
 8. *wing_overlap* — Pase MD → Regate MD → Pase LD → Pase MD → Remate DC
 9. *wing_overlap* — Pase MI → Regate SDD → Pase LD → Pase SDD → Remate SDI
10. *wing_overlap* — Pase MD → Regate MD → Pase LD → Pase MD → Remate MI
11. *wing_cutback* — Pase MD → Regate SDD → Desmarque MD → Pase SDD → Tiro DC
12. *wing_cutback* — Pase MD → Regate MD → Desmarque SDD → Pase MD → Tiro SDD
13. *wing_cutback* — Pase MD → Regate SDD → Desmarque MD → Pase SDD → Tiro MD
14. *through_ball* — Pase DFD → Pase MI → Desmarque MD → Desmarque DC → Tiro SDD
15. *through_ball* — Pase DFI → Pase MD → Desmarque MI → Desmarque DC → Tiro SDD
16. *give_and_go* — Pase MD → Pase DC → Desmarque MD → Pase DC → Tiro SDD
17. *give_and_go* — Pase MI → Pase DC → Desmarque MI → Pase DC → Tiro SDD
18. *counter* — Pase DFD → Regate MD → Pase MI → Desmarque DC → Tiro SDD
19. *counter* — Pase DFI → Regate SDD → Pase MI → Desmarque DC → Tiro SDD
20. *long_ball* — Pase DFD → Desmarque DC → Pase SDD → Desmarque DC → Remate SDD
21. *long_ball* — Pase DFI → Desmarque DC → Pase SDI → Desmarque DC → Remate SDD
22. *long_ball* — Pase DFD → Desmarque DC → Pase SDD → Desmarque DC → Remate MD
23. *long_shot* — Pase MI → Regate MD → Tiro DC
24. *long_shot* — Pase MD → Regate MI → Tiro SDD
25. *solo_run* — Regate MD → Regate SDD → Regate SDD → Tiro DC
26. *solo_run* — Regate MD → Regate SDD → Regate SDD → Tiro DC
27. *overload* — Pase MD → Desmarque LD → Pase MI → Desmarque SDD → Remate DC
28. *overload* — Pase MD → Desmarque LD → Pase MD → Desmarque SDD → Remate DC
29. *overload* — Pase MD → Desmarque LD → Pase MI → Desmarque SDD → Remate MD
30. *third_man* — Pase DFD → Pase MI → Pase MD → Desmarque DC → Tiro SDD
31. *third_man* — Pase DFI → Pase MD → Pase MI → Desmarque DC → Tiro SDD
32. *carrilero_run* — Pase DFD → Desmarque MD → Pase MI → Remate DC
33. *carrilero_run* — Pase DFD → Desmarque MD → Pase MI → Remate SDD
34. *carrilero_run* — Pase DFD → Desmarque MD → Pase MI → Remate MD
