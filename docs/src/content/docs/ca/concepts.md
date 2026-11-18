---
title: Conceptes
description: Les mètriques que mesura el taller, com es descomponen i com decideix el gate si una branca empitjora.
sidebar:
  order: 3
---

El que convé tenir clar abans del pas 1: què mesura el taller, com es descompon cada mètrica per saber on se'n va el temps, i com decideix el gate si una branca ha empitjorat. Cada apartat enllaça una lectura per anar més lluny; la llista completa és a [Referències](../references/).

## Tres preguntes, tres mètriques

Web Performance és el que una persona percep, mesurat. Les Core Web Vitals ho resumeixen en tres preguntes:

| Pregunta | Mètrica | "Good" fins a |
|---|---|---|
| Quan veig el que he vingut a veure? | LCP, Largest Contentful Paint: quan es pinta l'element més gran de la pantalla | 2,5 s |
| Es mou la pàgina mentre la faig servir? | CLS, Cumulative Layout Shift: quant es desplaça el contingut sense que jo ho provoqui | 0,1 |
| Reacciona en el moment que toco alguna cosa? | INP, Interaction to Next Paint: quant triga la pàgina a pintar la resposta a una interacció | 200 ms |

Els llindars són els de Google per al percentil 75 de les visites reals, i són els que WebPerf Snippets retorna amb cada mesura. Cap dels tres no diu per què: per això cada mètrica es descompon.

Per llegir més: [Web Vitals](https://web.dev/articles/vitals), a web.dev.

## LCP: quatre fases

L'LCP d'una imatge és la suma de quatre temps, un darrere l'altre:

| Fase | Què passa | Quan creix |
|---|---|---|
| TTFB | Fins que arriba el primer byte de l'HTML | Servidor lent, redireccions |
| Retard de càrrega del recurs | Fins que el navegador comença a demanar la imatge | La imatge no és a l'HTML, porta `loading="lazy"` o no té preload |
| Temps de càrrega del recurs | El que triga a descarregar-se | Imatge gran, poca prioritat, xarxa lenta |
| Retard de render | Des que arriba fins que es pinta | JavaScript o CSS que bloquegen el fil principal |

Saber quina fase creix diu on mirar. A `pr/lcp-hero-lazy` creix el retard de càrrega: la imatge perd el preload i el navegador no sap que la necessita fins que executa el JavaScript de la pàgina. A `pr/loaf-cart-handler` creix el retard de render: un script síncron ocupa el fil principal. El mateix número, dues causes i dos arranjaments diferents.

Per llegir més: [Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp).

## CLS: no tots els desplaçaments compten

Un desplaçament compta quan la persona no l'ha provocat: un bàner que entra sense espai reservat, una font que canvia de mida en carregar. No compta el que arriba en els 500 ms següents a una interacció, com un panell que s'obre en fer click, perquè és la resposta que la persona espera.

El CLS no suma tots els desplaçaments de la visita: els agrupa en ràfegues i es queda amb la pitjor. I el número no basta per arreglar-ho: cal saber quins nodes es mouen, que és el que retorna el subagent de CLS.

Per llegir més: [Cumulative Layout Shift](https://web.dev/articles/cls).

## INP i els long animation frames

Una interacció té tres fases:

| Fase | Què passa |
|---|---|
| Retard d'entrada | El fil principal està ocupat amb una altra cosa i l'esdeveniment espera |
| Processament | Corren els handlers de l'esdeveniment |
| Retard de presentació | El navegador calcula estils i layout i pinta el frame següent |

L'INP d'una pàgina és, aproximadament, la seva pitjor interacció. Al taller n'hi ha una sola, el click a "Add to cart", i a `pr/loaf-cart-handler` el que creix és el processament: el handler calcula recomanacions abans de deixar pintar.

Els long animation frames (LoAF) són la pista per atribuir-ho: el navegador apunta cada frame que triga més de 50 ms, amb els scripts que l'ocupen i qui els invoca. El trace del click baixa un nivell més i anomena la funció.

Com que el processament és JavaScript pur, l'INP depèn de la velocitat de la CPU en aquell moment: la mateixa branca dona més mil·lisegons en una màquina més lenta o més carregada. Per això les guies donen les seves xifres com a exemple i el gate compara dues botigues a la mateixa màquina.

Per llegir més: [Interaction to Next Paint](https://web.dev/articles/inp) i [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames).

## Laboratori i camp

| | Camp | Laboratori |
|---|---|---|
| Què mesura | Persones reals, amb els seus dispositius i les seves xarxes | Una càrrega en condicions fixes |
| Quan arriba | Dies després de publicar | Abans del merge |
| Per a què serveix | Saber què passa de debò | Comparar dues versions del codi |

Un gate de pull request necessita laboratori. Les condicions del taller són sempre les mateixes: CPU 4x (quatre vegades més lenta), la xarxa Fast 4G de DevTools (8,1 Mbps de baixada, 1,35 Mbps de pujada i 165 ms de latència) i diverses execucions de cada mesura: `--runs 5` per botiga al gate, alternant una de `main` i una de la branca.

El throttling de xarxa no és un adorn: sense ell, la prioritat de descàrrega d'una imatge gairebé no pesa i la regressió de `pr/lcp-hero-lazy` no es veu. Les dades són a [Per què aquest stack](../stack/).

Per llegir més: [Why lab and field data can be different](https://web.dev/articles/lab-and-field-data-differences).

## Comparar amb el baseline, no amb el llindar

Amb la màquina sola, les tres regressions del taller deixen les seves mètriques dins de "good" gairebé sempre: a l'experiment [`gate-stability`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/gate-stability/README.ca.md), només l'INP de `pr/loaf-cart-handler` surt de "good", 4 vegades de 50. Les xifres canvien amb l'equip i amb la càrrega de la CPU en el moment de mesurar: amb el model local generant text alhora, aquest INP surt de "good" les 40 vegades. Un gate que només mirés els llindars de Google deixaria passar les tres regressions amb la màquina sola, i amb la màquina ocupada fallaria per la màquina i no pel canvi. La pàgina, a més, aniria empitjorant de merge en merge fins a creuar el llindar sense que cap canvi concret en tingués la culpa.

Per això el gate compara cada branca amb la seva versió base: la botiga de `main` (el baseline) i la de la branca (el candidate), mesurades a la mateixa màquina i en la mateixa crida, alternant una execució de cada una. Així la diferència entre portàtils no compta: un portàtil lent mesura les dues botigues igual de lentes. I tampoc no compta el que li passi al portàtil a mitja mesura, perquè els passa a les dues.

## Com decideix el gate

El gate mira dues coses de cada mètrica:

1. **Si el canvi és gran.** La mediana de la branca supera la del baseline en més que el seu llindar: el més gran entre el 10 % i 100 ms per a l'LCP, el més gran entre el 10 % i 50 ms per a l'INP, i 0,05 per al CLS.
2. **Si el canvi no és soroll.** Un test estadístic, Mann-Whitney U, dona p < 0,05.

Amb aquestes dues respostes, cada mètrica acaba en un de tres veredictes:

| Veredicte | Quan | Què fa el gate |
|---|---|---|
| `regressed`, empitjora | El canvi supera el seu llindar i p < 0,05 | Falla: la CLI surt amb 1 |
| `inconclusive`, no concloent | El canvi supera el seu llindar, però p no baixa de 0,05 | Mesura dues execucions més per botiga i decideix una altra vegada. Si continua igual, no falla, i l'informe diu que cal tornar-ho a llançar |
| `unchanged`, sense canvis | El canvi no supera el seu llindar | Passa |

Cap model no intervé en aquesta decisió.

<img src="/diagrams/gate.svg" alt="El gate mesura el baseline i la branca alternant les seves execucions; si el canvi supera el llindar i p és menor que 0,05, surt amb 1, trace-engine-cli atribueix el canvi i l'LLM l'explica; si supera el llindar i p no hi arriba, mesura dues execucions més per costat i decideix una altra vegada; si no, surt amb 0" width="1120" height="340" loading="lazy" decoding="async">

### Què és p, sense fórmules

Dues mesures de la mateixa pàgina mai no donen el mateix. Mann-Whitney U no mira els mil·lisegons, sinó l'ordre: posa en fila totes les execucions dels dos costats, de la més ràpida a la més lenta, i mira quant es barregen. Si totes les de la branca queden darrere de totes les del baseline, és molt difícil que sigui casualitat. Si es barregen, pot ser soroll.

p és aquesta probabilitat: la de veure un ordre així de separat si en realitat les dues botigues fossin igual de ràpides. Per sota de 0,05, el gate ho dona per un canvi real.

### Per què importa quantes vegades es mesura

Amb poques execucions, l'ordre té poques combinacions possibles i una sola execució fora de lloc canvia el resultat. Imagina una regressió clara, en què la branca és sempre més lenta que el baseline. Aquesta taula és el p que dona el gate segons quantes execucions del baseline surtin, per mala sort, més lentes que totes les de la branca, per exemple perquè la màquina va fer una altra cosa en aquell moment:

| Execucions per costat | Cap del baseline lenta | Una de lenta | Dues de lentes |
|---|---|---|---|
| 5 | 0,004 | 0,0754 | 0,3452 |
| 7 | 0,0003 | 0,0131 | 0,1043 |
| 9 | < 0,0001 | 0,002 | 0,0252 |

Amb 5 execucions per costat, una sola execució lenta del baseline deixa p a 0,0754, per sobre de 0,05. Un gate que parés aquí donaria la branca per bona encara que el seu LCP hagués pujat un 50 %. No és una hipòtesi: mesurant amb el portàtil ocupat, a `pr/lcp-hero-lazy` li va passar 3 vegades de 20.

Per això el gate del taller no para aquí. Quan un canvi supera el seu llindar i p no hi arriba, en diu no concloent i mesura fins a 7 execucions per botiga (`--max-runs 7`), on aquesta mateixa execució lenta deixa p a 0,0131. Decideix com a màxim dues vegades, amb 5 i amb 7 execucions per botiga, mai després de cada execució afegida: mirar p una vegada i una altra fins que baixi de 0,05 acabaria trobant un canvi per casualitat.

### Per què importa l'ordre

Mesurar primer totes les execucions de `main` i després totes les de la branca sembla innocent. Però entre un bloc i l'altre passa prop de mig minut, i un portàtil no va sempre igual de ràpid: arrenca una còpia de seguretat, entra una videotrucada. Si es frena just durant el bloc de la branca, totes les seves execucions surten més lentes i el test veu una regressió on no n'hi ha. Amb el portàtil ocupat, una branca que no canvia res va fallar el gate 3 vegades de 40 mesurant per blocs, i cap alternant les execucions de les dues botigues.

La lliçó val per a qualsevol gate: les regles són deterministes, però les mostres no. Alterna les mesures de les dues versions i, quan les dades no arribin per decidir, que el gate ho digui en lloc de donar un pass. Les xifres surten de les dues nits de mesura de l'experiment [`gate-stability`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/gate-stability/README.ca.md).

Per llegir més: [Mann-Whitney U test](https://en.wikipedia.org/wiki/Mann%E2%80%93Whitney_U_test) i la [variabilitat de les mesures de laboratori](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md), a la documentació de Lighthouse.

## Qui fa què

| Pas | Qui | Amb què |
|---|---|---|
| Mesurar | Els subagents i el gate | WebPerf Snippets, per MCP o per la seva CLI |
| Decidir | Les regles | El llindar i el test estadístic de la CLI, i el seu exit code |
| Atribuir | Les regles | trace-engine-cli anomena la funció, la URL i la línia |
| Explicar | Un LLM | Rep el veredicte, les mètriques, els resums dels traces i el diff, i escriu la causa en una frase |

Els subagents no són models: són codi que crida eines MCP amb arguments fixos. L'únic model del taller explica, i quan contradiu les regles, guanyen les regles. Per què està repartit així ho explica [Learnings](../learnings/#lllm-explica-les-regles-decideixen).
