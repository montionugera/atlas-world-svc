// ============================================================================
// 02b_cartography_pipeline.js
// Composable Cartographic Component Library, Declarative World Map Spec
// Registry & 6-Stage Vector Layer Pipeline for the Atlas World Observatory.
// ============================================================================

let ATLAS_ACTIVE_WORLD_MAP_PRESET_ID = "cradle_of_embers";

const ATLAS_WORLD_MAP_PRESETS = {
  cradle_of_embers: {
    id: "cradle_of_embers",
    title: "The Cradle of Embers — Clockwork & Hearth-Kiln Continents",
    canvas: { width: 1040, height: 500 },
    continents: [
      // Primary Three-Crown Mainland: Star-Heart Tableland (NW) + Aurora Fjord + Crown-Beacon Peninsula (NE)
      // + Chronometer Caldera Reach (E) + Glass-Mire Fjords (SE) + Hearth-Kiln Heartland (S/SW) + Star-Tether Inland Sea (Central-West)
      [
        [86,82],[104,48],[148,34],[198,24],[252,32],[304,22],[358,28],[414,22],[468,28],[518,38],
        [558,64],[592,72],[624,52],[662,24],[718,18],[778,22],[838,18],[898,28],[946,48],[968,82],
        [956,118],[924,148],[944,178],[982,208],[996,252],[988,298],[954,334],[912,348],[868,354],[822,368],
        [794,398],[804,432],[782,458],[736,468],[692,458],[654,432],[622,438],[592,468],[542,478],[494,470],
        [448,476],[398,482],[346,478],[296,472],[248,476],[198,472],[152,468],[108,456],[82,432],[52,412],
        [68,376],[48,342],[38,298],[52,254],[88,232],[138,226],[192,222],[248,228],[308,222],[364,226],
        [418,218],[462,198],[472,172],[444,150],[396,134],[342,140],[288,132],[234,138],[178,132],[128,122],[92,104]
      ]
    ],
    islands: [
      // Isle of Cinder-Sails (Western Strait)
      [[24,160],[44,146],[74,148],[96,162],[98,184],[80,200],[50,202],[28,190],[18,174]],
      // Aether-Lens Atoll (Mid-Strait)
      [[194,172],[214,160],[244,162],[260,176],[252,194],[224,198],[200,190]],
      // Sunken Orrery Isle (Inner Star-Tether Gulf)
      [[310,170],[334,156],[368,154],[396,166],[404,184],[384,202],[350,204],[320,196],[306,182]],
      // Bellows Western Key
      [[20,382],[38,368],[66,372],[80,390],[84,424],[68,448],[44,456],[22,440],[14,412]],
      // Southern Kiln-Archipelago & Glass-Mire Keys
      [[554,464],[574,456],[600,458],[612,470],[598,486],[572,488],[552,476]],
      [[628,450],[648,442],[674,446],[684,460],[670,482],[646,482],[624,466]],
      [[718,468],[744,460],[778,462],[794,474],[780,492],[746,492],[716,480]]
    ],
    plateaus: [
      [[136,248],[198,238],[276,244],[356,256],[438,252],[508,274],[532,328],[496,374],[412,382],[318,372],[214,368],[146,338]],
      [[594,206],[668,182],[754,172],[846,178],[936,208],[964,262],[932,318],[842,338],[736,332],[642,306],[582,258]],
      [[118,44],[218,32],[348,34],[478,44],[538,76],[512,118],[418,124],[298,122],[188,118],[118,96]],
      [[648,42],[738,30],[838,34],[918,56],[932,102],[884,136],[784,142],[684,136],[634,98]],
      [[476,148],[548,138],[624,146],[674,176],[668,226],[608,248],[524,244],[468,214]]
    ],
    basins: [
      [[284,264],[334,256],[382,276],[386,314],[346,348],[296,342],[264,304]],
      [[498,242],[544,234],[584,258],[586,298],[546,324],[502,316],[478,278]],
      [[412,358],[462,352],[504,374],[506,414],[466,438],[418,432],[394,394]],
      [[624,394],[684,386],[742,404],[748,438],[704,458],[644,452],[608,422]],
      [[148,62],[204,54],[254,68],[258,104],[212,122],[158,116],[134,88]],
      [[508,68],[568,62],[624,78],[628,116],[582,134],[524,126],[496,96]]
    ],
    biomes: [
      {
        id: "violet_spore_fen",
        fill: "rgba(52,64,38,0.50)",
        accentStroke: "rgba(134,1ef,172,0.18)",
        signature: "spore_rings",
        pockets: [
          "M 308,268 C 348,258 396,262 424,314 C 408,342 388,356 316,352 C 294,336 288,312 308,268 Z",
          "M 452,356 C 484,348 514,348 532,388 C 512,404 486,408 444,388 Z",
          "M 496,158 C 546,148 598,154 618,198 C 596,224 554,232 492,212 Z"
        ],
        detailsD: "M 342,308 a 6,3.5 0 1,0 12,0 a 6,3.5 0 1,0 -12,0 M 364,318 a 4.5,2.6 0 1,0 9,0 a 4.5,2.6 0 1,0 -9,0 M 552,188 a 7,4 0 1,0 14,0 a 7,4 0 1,0 -14,0"
      },
      {
        id: "sakura_gold_canopy",
        fill: "rgba(96,88,44,0.46)",
        signature: "terrace_arcs",
        pockets: [
          "M 512,378 C 552,370 588,372 616,412 C 596,438 574,448 518,438 C 502,422 496,404 512,378 Z",
          "M 384,412 C 428,404 468,406 484,454 C 456,468 426,472 372,446 Z",
          "M 312,56 C 362,48 412,52 432,92 C 408,114 368,118 308,98 Z"
        ],
        detailsD: "M 534,398 Q 558,390 582,398 M 528,412 Q 556,404 586,412 M 398,428 Q 426,420 454,428"
      },
      {
        id: "ochre_badland_canyon",
        fill: "rgba(138,108,62,0.46)",
        signature: "canyon_strata",
        pockets: [
          "M 68,368 C 122,356 176,358 204,412 C 188,442 168,458 76,452 C 58,432 52,408 68,368 Z",
          "M 632,216 C 682,202 728,204 752,254 C 726,276 698,286 626,266 Z",
          "M 118,58 C 174,48 228,52 254,98 C 232,124 188,128 114,108 Z"
        ],
        detailsD: "M 88,396 Q 128,386 168,398 M 96,414 Q 136,404 176,416 M 652,238 Q 692,228 732,240"
      },
      {
        id: "crimson_magma_caldera",
        fill: "rgba(118,52,32,0.52)",
        signature: "lava_fissures",
        pockets: [
          "M 792,208 C 856,196 918,198 962,254 C 938,288 914,306 802,296 C 784,276 776,252 792,208 Z",
          "M 798,48 C 852,40 904,44 936,92 C 908,116 868,126 792,110 Z"
        ],
        lavaFissuresD: "M 862,212 L 878,226 L 896,222 L 914,238 M 878,226 L 872,246 L 888,262 M 824,242 L 846,252 L 862,246 M 856,66 L 876,78 L 898,74 L 912,88 M 876,78 L 868,96"
      },
      {
        id: "turquoise_sulfur_springs",
        fill: "rgba(64,96,76,0.46)",
        signature: "geyser_pools",
        pockets: [
          "M 618,386 C 678,376 738,378 762,436 C 738,460 714,472 624,462 C 608,444 602,424 618,386 Z",
          "M 182,252 C 232,242 276,244 294,296 C 272,316 246,324 174,302 Z",
          "M 648,54 C 708,42 768,48 788,98 C 764,124 718,132 644,112 Z"
        ],
        frostShelvesD: "M 672,64 C 704,56 744,58 762,78 C 748,94 712,96 676,84 Z M 694,72 C 716,66 738,68 748,80 C 736,90 714,90 696,82 Z"
      }
    ],
    lakes: [
      { id: "lake-cinnamon-basin", pts: [[186,348],[191,338],[202,334],[212,337],[218,344],[226,338],[238,335],[245,344],[241,355],[230,362],[218,360],[206,363],[194,359]], islands: ["M 210,347 C 215,344 222,345 224,350 C 225,354 218,356 212,354 Z"] },
      { id: "lake-chime-fen", pts: [[106,246],[114,237],[126,239],[136,233],[148,237],[156,243],[151,252],[152,259],[142,260],[131,263],[120,260],[112,253]] },
      { id: "lake-whispering-lagoon", pts: [[314,284],[322,275],[334,277],[346,270],[358,274],[372,272],[381,279],[377,288],[381,296],[372,302],[360,300],[348,307],[334,306],[322,299],[314,292]], islands: ["M 342,286 C 348,283 356,285 358,290 C 359,294 350,296 344,293 Z"] },
      { id: "lake-whispering-east-pool", pts: [[383,295],[390,291],[397,295],[396,302],[388,304]] },
      { id: "lake-lantern-delta", pts: [[358,436],[366,429],[376,433],[386,428],[396,433],[395,442],[400,451],[392,458],[380,455],[370,458],[360,451],[355,443]] },
      { id: "lake-porcelain-mirror", pts: [[548,422],[556,413],[568,416],[580,409],[596,408],[607,416],[608,426],[596,432],[582,431],[570,439],[556,441],[546,432]] },
      { id: "lake-root-train-sound", pts: [[666,428],[678,416],[694,418],[710,411],[728,409],[746,416],[755,428],[746,442],[732,449],[714,457],[696,455],[678,448],[664,438]], islands: ["M 696,426 C 706,422 718,424 722,431 C 724,437 712,441 700,438 C 692,436 690,429 696,426 Z", "M 728,434 C 734,431 742,433 743,438 C 744,442 736,444 730,441 Z"] },
      { id: "lake-pinion-reservoir", pts: [[736,304],[748,294],[762,296],[778,287],[794,284],[810,292],[813,302],[800,310],[801,320],[788,323],[772,319],[756,322],[740,315]], islands: ["M 772,298 C 778,295 786,297 788,302 C 789,306 780,308 774,305 Z"] },
      { id: "lake-leyden-thermal", pts: [[798,190],[808,181],[822,181],[834,176],[846,182],[846,194],[834,204],[818,206],[802,201]] },
      { id: "lake-spiral-geyser", pts: [[852,187],[860,183],[867,188],[864,195],[855,195]] },
      { id: "lake-star-tether-sea", pts: [[388,92],[398,83],[410,87],[422,79],[434,85],[447,83],[453,93],[444,102],[447,111],[433,111],[419,117],[407,109],[393,111],[392,100]], islands: ["M 416,94 C 422,91 430,93 432,98 C 433,102 424,104 418,101 Z"] },
      { id: "lake-star-heart-tarn", pts: [[176,50],[186,44],[198,46],[204,54],[196,62],[182,60]] },
      { id: "lake-tether-mire", pts: [[514,78],[526,71],[542,74],[548,84],[538,94],[522,92],[512,86]] },
      { id: "lake-cloud-halo-glacier", pts: [[702,68],[714,61],[728,64],[734,74],[724,84],[708,82],[698,75]] },
      { id: "lake-aether-spore-lagoon", pts: [[578,194],[592,186],[612,188],[622,198],[614,210],[596,212],[580,206]], islands: ["M 594,196 C 600,193 608,195 609,200 C 610,204 602,206 596,203 Z"] },
      { id: "lake-pendulum-crater-moat", pts: [[648,228],[660,221],[676,223],[684,233],[674,244],[656,243],[646,236]] },
      { id: "lake-orrery-highland-tarn", pts: [[278,44],[288,38],[300,40],[304,48],[294,54],[282,52]] },
      { id: "lake-echo-north-tarn", pts: [[496,192],[508,185],[522,188],[526,198],[516,206],[502,204]] }
    ],
    rivers: [
      { pts: [[40,394],[45,410],[41,426],[43,440]], w0: 0.35, w1: 2.3, seed: 1, f0: 0.25, f1: 2.0 },
      { pts: [[130,250],[146,274],[158,296],[176,318],[202,344]], w0: 1.4, w1: 2.4, seed: 2, f0: 1.8, f1: 1.9 },
      { pts: [[262,262],[252,282],[240,302],[232,320],[222,345]], w0: 0.35, w1: 2.3, seed: 3, f0: 0.25, f1: 1.9 },
      { pts: [[212,352],[202,378],[212,398],[198,420],[205,444],[195,478]], w0: 2.3, w1: 3.8, seed: 4, f0: 1.8, f1: 2.1 },
      { pts: [[312,250],[322,266],[338,285]], w0: 0.35, w1: 2.0, seed: 5, f0: 0.25, f1: 1.9 },
      { pts: [[388,260],[376,272],[362,284]], w0: 0.35, w1: 2.0, seed: 6, f0: 0.25, f1: 1.9 },
      { pts: [[342,294],[330,312],[318,328],[324,340],[342,344],[352,352],[348,364],[338,376],[344,390],[362,400],[375,414],[376,442]], w0: 2.2, w1: 3.4, seed: 7, f0: 1.9, f1: 1.9 },
      { pts: [[396,332],[392,354],[389,376],[385,396],[373,416]], w0: 0.35, w1: 2.4, seed: 8, f0: 0.25, f1: 1.9 },
      { pts: [[380,446],[384,464],[388,484]], w0: 2.4, w1: 3.8, seed: 9, f0: 1.8, f1: 2.1 },
      { pts: [[368,446],[358,462],[350,482]], w0: 1.9, w1: 3.0, seed: 10, f0: 1.8, f1: 2.1 },
      { pts: [[468,276],[484,302],[498,328],[514,354],[524,382],[542,404],[566,424]], w0: 0.35, w1: 3.4, seed: 11, f0: 0.25, f1: 1.9 },
      { pts: [[570,430],[562,456],[564,482]], w0: 2.5, w1: 4.0, seed: 12, f0: 1.8, f1: 2.1 },
      { pts: [[558,430],[538,454],[528,482]], w0: 2.0, w1: 3.2, seed: 13, f0: 1.8, f1: 2.1 },
      { pts: [[596,248],[614,278],[628,308],[646,338],[662,372],[678,398],[704,428]], w0: 0.35, w1: 3.6, seed: 14, f0: 0.25, f1: 1.9 },
      { pts: [[706,444],[709,462],[712,480]], w0: 2.7, w1: 4.2, seed: 15, f0: 1.8, f1: 2.1 },
      { pts: [[748,214],[760,242],[768,268],[776,298]], w0: 0.35, w1: 2.4, seed: 16, f0: 0.25, f1: 1.9 },
      { pts: [[794,304],[836,316],[868,320],[898,334],[934,352]], w0: 2.3, w1: 4.0, seed: 17, f0: 1.8, f1: 2.1 },
      { pts: [[190,54],[176,72],[194,92],[178,112],[158,126],[142,136]], w0: 1.2, w1: 3.0, seed: 18, f0: 1.7, f1: 2.2 },
      { pts: [[291,46],[274,66],[296,86],[272,108],[284,126],[272,146]], w0: 1.2, w1: 2.8, seed: 19, f0: 1.7, f1: 2.2 },
      { pts: [[474,48],[458,64],[436,76],[422,90]], w0: 0.35, w1: 2.1, seed: 20, f0: 0.25, f1: 1.8 },
      { pts: [[526,84],[498,94],[472,102],[442,98]], w0: 1.3, w1: 2.2, seed: 21, f0: 1.7, f1: 1.8 },
      { pts: [[414,106],[404,122],[384,132],[368,146]], w0: 1.8, w1: 3.2, seed: 22, f0: 1.8, f1: 2.2 },
      { pts: [[532,88],[522,114],[544,138],[528,164],[558,184],[588,198]], w0: 1.3, w1: 2.6, seed: 23, f0: 1.7, f1: 1.8 },
      { pts: [[606,204],[628,216],[656,232]], w0: 1.6, w1: 2.5, seed: 24, f0: 1.7, f1: 1.8 },
      { pts: [[712,76],[688,96],[698,122],[674,148],[686,178],[668,206],[666,230]], w0: 1.4, w1: 2.8, seed: 25, f0: 1.8, f1: 1.8 },
      { pts: [[724,76],[748,96],[734,122],[762,146],[788,168],[812,188]], w0: 1.4, w1: 2.6, seed: 26, f0: 1.8, f1: 1.8 },
      { pts: [[854,54],[878,76],[862,104],[894,128],[926,144],[948,160]], w0: 0.35, w1: 2.8, seed: 27, f0: 0.25, f1: 2.2 },
      { pts: [[512,196],[494,218],[468,238],[436,258],[398,274],[366,286]], w0: 1.3, w1: 2.5, seed: 28, f0: 1.7, f1: 1.9 }
    ],
    mountainRanges: [
      { id: "range-chime-western-wall", pts: [[142,244],[149,264],[145,284],[152,304],[147,324]], tier: "ridge", style: "crag" },
      { id: "range-cinnamon-divide", pts: [[148,346],[155,364],[149,382],[157,398]], tier: "foothill", style: "arch" },
      { id: "range-whispering-south-rim", pts: [[248,344],[268,339],[288,345],[308,340],[326,345]], tier: "ridge", style: "arch" },
      { id: "range-echo-central-spine", pts: [[438,242],[446,266],[441,292],[450,318],[444,342],[452,362]], tier: "hero", style: "crag" },
      { id: "range-kilnwatch-scarp", pts: [[544,320],[566,315],[588,321],[610,316],[628,323]], tier: "ridge", style: "crag" },
      { id: "range-porcelain-east-wall", pts: [[640,366],[649,386],[643,404],[652,420]], tier: "foothill", style: "arch" },
      { id: "range-dragonspine-cordillera", pts: [[716,168],[725,192],[720,216],[730,240],[726,260]], tier: "hero", style: "crag" },
      { id: "range-caldera-south-wall", pts: [[810,240],[836,235],[862,241],[888,236],[914,243],[934,238]], tier: "hero", style: "volcanic" },
      { id: "range-star-heart-amphitheater", pts: [[118,58],[144,44],[178,42],[214,52],[236,76],[228,104],[204,122]], tier: "hero", style: "crag" },
      { id: "range-orrery-west-spur", pts: [[236,76],[258,92],[264,116]], tier: "foothill", style: "arch" },
      { id: "range-orrery-north-crest", pts: [[312,56],[344,44],[382,48],[416,64]], tier: "ridge", style: "arch" },
      { id: "range-shattered-halo-spine", pts: [[468,38],[496,54],[508,82],[492,112],[506,142],[488,172],[508,202],[492,232]], tier: "hero", style: "crag" },
      { id: "range-starfall-east-arc", pts: [[574,46],[608,56],[634,78],[622,108],[598,132]], tier: "ridge", style: "crag" },
      { id: "range-spore-lagoon-rim", pts: [[548,168],[578,162],[612,168],[638,184]], tier: "foothill", style: "arch" },
      { id: "range-cloud-halo-glacier", pts: [[698,42],[736,50],[764,74],[752,104],[772,134],[754,162]], tier: "hero", style: "crag" },
      { id: "range-aurora-caldera-rim", pts: [[818,46],[858,52],[894,72],[914,102],[892,134]], tier: "hero", style: "volcanic" },
      { id: "range-cinder-sails-ridge", pts: [[44,174],[62,166],[80,174]], tier: "foothill", style: "arch" },
      { id: "range-sunken-orrery-ridge", pts: [[332,176],[356,168],[380,176]], tier: "foothill", style: "arch" }
    ],
    cliffEscarpments: [
      { pts: [[134,88],[156,112],[196,118],[226,108]], tickSide: 1 },
      { pts: [[318,74],[354,68],[388,76],[408,92]], tickSide: 1 },
      { pts: [[568,182],[598,176],[628,184],[636,204]], tickSide: 1 },
      { pts: [[642,222],[666,214],[690,224],[688,246]], tickSide: 1 },
      { pts: [[292,268],[336,260],[378,268],[392,294]], tickSide: 1 },
      { pts: [[812,196],[852,188],[892,196],[916,218]], tickSide: -1 }
    ],
    roads: {
      highways: [
        [[106,424],[144,416],[186,422],[226,412],[266,414],[305,418],[346,422],[392,414],[432,422],[488,414],[545,404]],
        [[545,404],[556,372],[584,344],[618,318],[662,308],[706,296],[745,288],[782,258],[814,236],[845,215]],
        [[118,96],[154,114],[212,114],[248,108],[278,118],[318,108],[356,96],[384,78],[418,72],[446,78],[478,98],[524,116],[565,122],[618,114],[658,118],[696,84],[742,82],[785,88],[842,68],[896,82],[918,92]]
      ],
      regional: [
        [[106,424],[116,390],[136,362],[168,346],[198,332],[215,332],[242,342],[274,332],[298,318]],
        [[86,254],[118,266],[152,294],[184,316],[215,332],[236,304],[256,274],[284,284],[298,302],[298,318]],
        [[342,272],[320,280],[308,298],[298,318],[302,336],[316,348],[336,354],[340,368],[326,382],[332,398],[352,402],[386,406],[432,422]],
        [[298,318],[318,314],[344,322],[364,334],[382,338],[428,348],[474,358],[514,376],[545,404],[592,396],[642,398],[682,408],[712,418]],
        [[336,354],[350,360],[358,378],[352,402]],
        [[382,338],[372,362],[378,384],[386,406]],
        [[618,318],[640,282],[665,252],[704,268],[745,288],[802,282],[858,276],[914,268],[968,262]],
        [[665,252],[722,234],[782,222],[845,215],[908,236],[968,262]],
        [[118,96],[136,74],[162,68],[198,64],[238,68],[266,92],[278,118]],
        [[278,118],[308,86],[348,62],[394,62],[446,78],[486,58],[526,72],[568,78],[594,106],[642,64],[678,86],[738,68],[785,88]],
        [[356,96],[372,114],[392,122],[436,120],[478,98],[492,92],[526,84]],
        [[524,116],[542,142],[532,174],[504,208],[466,244],[425,276],[474,282],[522,286],[566,294],[598,294],[618,318]],
        [[565,122],[594,106],[618,138],[658,118],[688,138],[736,182],[774,194],[818,186],[856,176],[874,196],[845,215]],
        [[618,138],[632,182],[636,224],[665,252]],
        [[785,88],[814,118],[856,112],[896,116],[918,92]],
        [[814,118],[792,156],[792,196],[845,215],[892,198],[924,214],[928,232]]
      ],
      switchbacks: [
        [[38,392],[48,408],[56,422],[76,430]],
        [[56,422],[50,434],[58,444]],
        [[432,422],[458,444],[486,458],[515,468]],
        [[514,376],[518,342],[516,308],[528,288],[572,302],[618,318]],
        [[152,418],[156,436],[164,454]],
        [[266,414],[274,438],[282,462]],
        [[352,402],[354,420],[354,438],[354,454]],
        [[454,352],[448,378],[446,402]],
        [[618,318],[628,346],[642,374]],
        [[745,288],[754,314],[766,338]],
        [[392,122],[374,148],[356,174],[334,186],[368,192],[386,176]],
        [[34,176],[56,164],[78,172],[64,188],[42,186]],
        [[208,178],[228,172],[246,180],[226,188]],
        [[288,258],[318,256],[348,258],[386,268],[425,276],[428,312],[428,348]],
        [[162,68],[168,92],[154,114]],
        [[212,114],[206,88],[198,64]]
      ]
    },
    groves: [
      // Broadleaf Deciduous & Golden Orchard Groves (Southern & Central Basins)
      { species: "deciduous", pts: [[82,292,2.2],[88,296,1.9],[76,295,1.8],[94,291,1.7],[118,348,2.1],[124,352,1.8],[184,278,2.2],[190,282,1.9],[178,281,1.8],[254,284,2.1],[260,288,1.8],[248,334,2.2],[253,337,1.9],[444,336,2.2],[449,339,1.9],[312,352,2.1],[518,354,2.1],[334,422,2.2],[339,425,1.9],[329,426,1.8],[344,421,1.7],[336,429,2.0],[472,372,2.2],[477,375,1.9],[467,376,1.8],[482,371,1.7],[475,379,2.0],[486,376,1.6],[620,362,2.2],[625,365,1.9],[615,366,1.8],[630,361,1.7],[623,369,2.0],[654,388,2.2],[659,391,1.9],[649,392,1.8],[664,387,1.7],[657,395,2.0],[728,306,2.0],[733,309,1.8],[724,310,1.7],[895,222,2.1],[902,226,1.8],[942,278,2.0],[48,182,2.2],[54,186,1.9],[72,184,2.0],[218,182,2.1],[224,186,1.8],[328,184,2.3],[334,188,2.0],[342,185,1.9],[368,186,2.2],[374,190,1.9],[382,184,1.8]] },
      // Golden Amber & Sakura Groves (Lantern Orchard, Porcelain Loom & Orrery Terrace)
      { species: "golden", pts: [[384,390,2.2],[389,393,1.9],[379,394,1.8],[394,389,1.7],[386,397,2.0],[374,391,1.6],[402,396,2.1],[407,399,1.8],[398,401,1.7],[412,394,1.9],[416,398,1.6],[556,412,2.4],[561,415,2.0],[551,416,1.9],[566,411,1.8],[558,419,2.1],[571,416,1.7],[576,418,2.2],[581,421,1.8],[572,423,1.7],[586,415,1.9],[591,419,1.6],[368,68,2.1],[374,72,1.8],[318,78,2.2],[324,82,1.9],[312,81,1.8]] },
      // Boreal Conifer & Alpine Pine Spires (Northern Shattered Halo, Cloud-Halo Glacier & Star-Heart Tableland)
      { species: "pine", pts: [[134,82,2.4],[140,86,2.1],[128,87,2.0],[172,98,2.3],[178,102,2.0],[166,101,1.9],[246,72,2.4],[252,76,2.1],[240,75,2.0],[458,64,2.4],[464,68,2.1],[452,67,2.0],[562,92,2.4],[568,96,2.1],[556,95,2.0],[618,86,2.4],[624,90,2.1],[612,89,2.0],[664,96,2.4],[670,100,2.1],[658,99,2.0],[714,106,2.3],[720,110,2.0],[796,102,2.4],[802,106,2.1],[846,88,2.4],[852,92,2.1],[882,96,2.3],[888,100,2.0],[682,164,2.3],[688,168,2.0],[768,162,2.3],[774,166,2.0]] },
      // Weeping Spore-Willow & Deadwood Groves (Whispering Mire, Tether Fen & Aether-Spore Lagoon)
      { species: "willow", pts: [[464,108,2.3],[470,112,2.0],[458,111,1.9],[476,109,1.8],[518,102,2.2],[524,106,1.9],[476,192,2.2],[482,196,1.9],[548,194,2.2],[554,198,1.9],[616,172,2.1],[622,176,1.8],[378,248,2.2],[384,252,1.9],[462,254,2.2],[468,258,1.9],[552,256,2.2],[558,260,1.9]] }
    ],
    ornaments: {
      compassRoses: [
        { cx: 46, cy: 52, r: 22, label: "ASTRAL NORTH" },
        { cx: 956, cy: 438, r: 26, label: "CHRONOMETER COMPASS" }
      ],
      maelstroms: [
        { cx: 142, cy: 176, r: 16, label: "Star-Tether Maelstrom" },
        { cx: 248, cy: 488, r: 14, label: "Bellows Undertow" }
      ],
      provinceBanners: [
        { id: "prov-star-heart", text: "STAR-HEART TABLELAND", d: "M 122,42 Q 218,28 318,44" },
        { id: "prov-shattered-halo", text: "THE SHATTERED HALO", d: "M 454,42 Q 565,30 676,46" },
        { id: "prov-crown-beacon", text: "CROWN-BEACON ASTRAL REACH", d: "M 712,38 Q 828,28 936,52" },
        { id: "prov-caldera-reach", text: "CHRONOMETER & CALDERA REACH", d: "M 728,162 Q 848,152 958,178" },
        { id: "prov-carillon-basin", text: "CARILLON & WHISPERING BASIN", d: "M 224,244 Q 358,232 492,248" },
        { id: "prov-hearth-kiln", text: "HEARTH-KILN HEARTLAND", d: "M 168,396 Q 312,384 456,398" },
        { id: "prov-porcelain-fjords", text: "PORCELAIN & GLAZE FJORDS", d: "M 548,392 Q 668,382 784,402" }
      ]
    }
  }
};

function registerAtlasWorldMapPreset(presetId, spec) {
  if (!presetId || !spec) return null;
  ATLAS_WORLD_MAP_PRESETS[presetId] = { ...spec, id: presetId };
  return ATLAS_WORLD_MAP_PRESETS[presetId];
}

function getActiveAtlasWorldMapSpec() {
  return ATLAS_WORLD_MAP_PRESETS[ATLAS_ACTIVE_WORLD_MAP_PRESET_ID] || ATLAS_WORLD_MAP_PRESETS.cradle_of_embers;
}

function setAtlasWorldMapPreset(presetId) {
  if (!ATLAS_WORLD_MAP_PRESETS[presetId]) return false;
  ATLAS_ACTIVE_WORLD_MAP_PRESET_ID = presetId;
  [
    "layer_0_base_elevation_dem",
    "layer_1_hydrology_splines",
    "layer_2_topography_cliffs_and_highlands",
    "layer_3_road_and_walkway_network",
    "layer_4_foliage_and_canopy_scatters",
    "layer_5_architectural_compounds_and_quest_rings"
  ].forEach(lid => patchSingleComposableLayerInPlace(lid));
  return true;
}

function extendAtlasWorldMapSpec(partialSpec, presetId = ATLAS_ACTIVE_WORLD_MAP_PRESET_ID) {
  const base = ATLAS_WORLD_MAP_PRESETS[presetId];
  if (!base || !partialSpec) return base;
  for (const key of ["continents", "islands", "plateaus", "basins", "biomes", "lakes", "rivers", "mountainRanges", "cliffEscarpments", "groves"]) {
    if (Array.isArray(partialSpec[key])) {
      base[key] = [...(base[key] || []), ...partialSpec[key]];
    }
  }
  if (partialSpec.roads) {
    base.roads = {
      highways: [...(base.roads.highways || []), ...(partialSpec.roads.highways || [])],
      regional: [...(base.roads.regional || []), ...(partialSpec.roads.regional || [])],
      switchbacks: [...(base.roads.switchbacks || []), ...(partialSpec.roads.switchbacks || [])]
    };
  }
  return base;
}

// ============================================================================
// Composable Cartographic Component Library (ATLAS_CARTO_COMPONENTS)
// ============================================================================

const ATLAS_CARTO_COMPONENTS = {
  compileLandmassD(spec) {
    const mainD = (spec.continents || []).map(pts => catmullSplineD(pts, true)).join(" ");
    const islD = (spec.islands || []).map(pts => Array.isArray(pts) ? catmullSplineD(pts, true) : String(pts)).join(" ");
    return `${mainD} ${islD}`.trim();
  },

  renderCoastalRippleRings(landMassD, theme) {
    return `
      <path d="${landMassD}" fill="none" stroke="${theme.rippleOuter}" stroke-width="13.5" stroke-linejoin="round"/>
      <path d="${landMassD}" fill="none" stroke="${theme.rippleMid}" stroke-width="8.2" stroke-linejoin="round"/>
      <path d="${landMassD}" fill="${theme.shelfCol}" stroke="${theme.rippleInner}" stroke-width="3.8" stroke-linejoin="round"/>
    `;
  },

  renderCompassRose({ cx, cy, r, label }) {
    const rOuter = r, rMid = +(r * 0.72).toFixed(1), rIn = +(r * 0.24).toFixed(1);
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4 - Math.PI / 2;
      const len = i % 2 === 0 ? rOuter : rMid * 0.82;
      const px = +(cx + Math.cos(ang) * len).toFixed(1), py = +(cy + Math.sin(ang) * len).toFixed(1);
      const aL = ang - 0.22, aR = ang + 0.22;
      const lx = +(cx + Math.cos(aL) * rIn).toFixed(1), ly = +(cy + Math.sin(aL) * rIn).toFixed(1);
      const rx = +(cx + Math.cos(aR) * rIn).toFixed(1), ry = +(cy + Math.sin(aR) * rIn).toFixed(1);
      pts.push(`<path d="M ${cx},${cy} L ${lx},${ly} L ${px},${py} Z" fill="#2b2113" opacity="0.78"/><path d="M ${cx},${cy} L ${px},${py} L ${rx},${ry} Z" fill="#c8b68e" opacity="0.78"/>`);
    }
    return `<g class="atlas-carto-compass-rose" opacity="0.76" pointer-events="none">
      <circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="rgba(34,26,15,0.14)" stroke="#2b2113" stroke-width="0.8"/>
      <circle cx="${cx}" cy="${cy}" r="${rMid}" fill="none" stroke="#2b2113" stroke-width="0.55" stroke-dasharray="2.2 1.4"/>
      ${pts.join("")}
      <circle cx="${cx}" cy="${cy}" r="2.2" fill="#d4af37" stroke="#2b2113" stroke-width="0.6"/>
      ${label ? `<text x="${cx}" y="${+(cy + rOuter + 5.2).toFixed(1)}" text-anchor="middle" font-size="2.9" font-family="Georgia, serif" font-weight="700" fill="#2b2113" letter-spacing="0.4">${escapeHtml(label)}</text>` : ""}
    </g>`;
  },

  renderSeaMaelstrom({ cx, cy, r }) {
    const r1 = +(r * 0.85).toFixed(1), r2 = +(r * 0.52).toFixed(1);
    return `<g class="atlas-carto-maelstrom" opacity="0.52" pointer-events="none">
      <path d="M ${cx - r},${cy} C ${cx - r},${cy - r1} ${cx + r1},${cy - r1} ${cx + r1},${cy} C ${cx + r1},${cy + r2} ${cx - r2},${cy + r2} ${cx - r2},${cy} C ${cx - r2},${cy - r2 * 0.5} ${cx + r2 * 0.4},${cy - r2 * 0.5} ${cx},${cy}" fill="none" stroke="#2b2113" stroke-width="0.95" stroke-linecap="round" stroke-dasharray="3.2 1.8"/>
      <path d="M ${cx + r * 0.8},${cy + 2} C ${cx + r * 0.5},${cy + r1} ${cx - r1},${cy + r1 * 0.8} ${cx - r1 * 0.8},${cy - 2}" fill="none" stroke="#dfd3b4" stroke-width="0.65" stroke-linecap="round"/>
    </g>`;
  },

  // Supports data-subbiome-mosaic="violet_spore_fen", data-subbiome-mosaic="sakura_gold_canopy", data-subbiome-mosaic="crimson_magma_caldera", etc.
  renderBiomeMosaics(biomes) {
    return (biomes || []).map(b => {
      const d = (b.pockets || []).join(" ");
      const lavaSvg = b.lavaFissuresD
        ? `<path d="${b.lavaFissuresD}" fill="none" stroke="#d9481c" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/><path d="${b.lavaFissuresD}" fill="none" stroke="#fde047" stroke-width="0.55" stroke-linecap="round"/>`
        : "";
      const frostSvg = b.frostShelvesD
        ? `<path d="${b.frostShelvesD}" fill="rgba(186,230,253,0.28)" stroke="rgba(224,242,254,0.45)" stroke-width="0.55"/>`
        : "";
      const detailSvg = b.detailsD
        ? `<path d="${b.detailsD}" fill="none" stroke="rgba(34,26,14,0.32)" stroke-width="0.6" stroke-dasharray="2.4 1.6"/>`
        : "";
      return `<path data-subbiome-mosaic="${escapeHtml(b.id)}" d="${d}" fill="${b.fill}"/>${lavaSvg}${frostSvg}${detailSvg}`;
    }).join("");
  },

  renderHydrologyNetwork(spec, theme) {
    const lakeArr = (spec.lakes || []).map(l => catmullSplineD(l.pts, true));
    const lakesD = lakeArr.join(" ");
    const lakeIslandsD = (spec.lakes || []).flatMap(l => l.islands || []).join(" ");
    const riverArr = (spec.rivers || []).map((r, i) =>
      variableRibbonPolyD(r.pts, r.w0 || 0.8, r.w1 || 2.6, r.seed || (i + 1), r.f0 || 1.2, r.f1 || 1.9)
    );
    const allWaterD = `${riverArr.join(" ")} ${lakesD}`.trim();
    const waterFillsSvg = [...riverArr, ...lakeArr].map(d => `<path d="${d}" fill="#8e9f99" stroke="none"/>`).join("");
    const customRivD = (ATLAS_INCREMENTAL_CUSTOM_FEATURES.rivers || []).map(r => r.d).join(" ");
    return `
      <g clip-path="url(#atlasMainlandClip)">
        <path d="${allWaterD}" fill="none" stroke="rgba(168,154,108,0.48)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="${allWaterD}" fill="none" stroke="#22190d" stroke-width="1.45" stroke-linejoin="round" stroke-linecap="round"/>
        ${waterFillsSvg}
        ${customRivD ? `<path d="${customRivD}" fill="none" stroke="#22190d" stroke-width="3.2" stroke-linecap="round"/><path d="${customRivD}" fill="none" stroke="#8e9f99" stroke-width="2.0" stroke-linecap="round"/>` : ""}
        <path d="${lakeIslandsD}" fill="${theme.landBaseCol}" stroke="#22190d" stroke-width="0.65" stroke-linejoin="round"/>
      </g>
    `;
  },

  renderCliffEscarpments(escarpments) {
    const rimPaths = [];
    const tickPaths = [];
    (escarpments || []).forEach(esc => {
      const pts = esc.pts || [];
      if (pts.length < 2) return;
      rimPaths.push(catmullSplineD(pts, false));
      const dense = sampleCatmullPts(pts, 4);
      const side = esc.tickSide || 1;
      for (let i = 1; i < dense.length - 1; i += 2) {
        const p0 = dense[i - 1], p1 = dense[i + 1], p = dense[i];
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * side, ny = (dx / len) * side;
        const tLen = i % 4 === 1 ? 3.2 : 1.9;
        tickPaths.push(`M ${+p[0].toFixed(1)},${+p[1].toFixed(1)} L ${+(p[0] + nx * tLen).toFixed(1)},${+(p[1] + ny * tLen).toFixed(1)}`);
      }
    });
    if (!rimPaths.length) return "";
    return `<path d="${rimPaths.join(" ")}" fill="none" stroke="#281d10" stroke-width="1.05" stroke-linecap="round"/><path d="${tickPaths.join(" ")}" fill="none" stroke="#281d10" stroke-width="0.58" stroke-linecap="round" opacity="0.78"/>`;
  },

  renderTopographyAndEscarpments(spec, theme) {
    const ranges = spec.mountainRanges || [];
    const massifFootprintD = ranges.map((r, idx) => {
      const w = r.tier === "hero" ? 18.5 : (r.tier === "foothill" ? 12.0 : 15.5);
      return variableRibbonPolyD(r.pts, w, w * 0.88, idx + 31, 1.0, 1.0);
    }).join(" ");

    const peaks = [];
    ranges.forEach((r, rIdx) => {
      const dense = sampleCatmullPts(r.pts, 3);
      const tierMult = r.tier === "hero" ? 1.24 : (r.tier === "foothill" ? 0.78 : 1.0);
      dense.forEach(([px, py], i) => {
        const isHeroPeak = r.tier === "hero" && i % 2 === 1;
        const w = +((7.6 + ((rIdx * 7 + i * 5) % 4) * 1.1) * tierMult * (isHeroPeak ? 1.16 : 0.94)).toFixed(1);
        const h = +((4.8 + ((rIdx * 5 + i * 3) % 4) * 0.8) * tierMult * (isHeroPeak ? 1.22 : 0.92)).toFixed(1);
        const jx = +(((i * 11 + rIdx * 7) % 5 - 2) * 0.95).toFixed(1);
        peaks.push({ x: +(px + jx).toFixed(1), y: +py.toFixed(1), w, h, style: r.style || "crag", isHero: isHeroPeak });
        const side = (i + rIdx) % 2 === 0 ? 1 : -1;
        peaks.push({ x: +(px + side * w * 0.56).toFixed(1), y: +(py + 2.5).toFixed(1), w: +(w * 0.68).toFixed(1), h: +(h * 0.64).toFixed(1), style: "arch", isHero: false });
      });
    });

    peaks.sort((a, b) => a.y - b.y);
    const orderedArchesSvg = peaks.map(({ x, y, w, h, style, isHero }) => {
      const xL = +(x - w).toFixed(1), xR = +(x + w).toFixed(1), yB = +(y + h * 0.52).toFixed(1), yT = +(y - h * 0.84).toFixed(1);
      const cLx = +(x - w * (style === "crag" ? 0.34 : 0.44)).toFixed(1), cRx = +(x + w * (style === "crag" ? 0.38 : 0.44)).toFixed(1), cTy = +(y - h * 0.80).toFixed(1);
      const rMidX = +(x + w * 0.16).toFixed(1), rMidY = +(y + h * 0.08).toFixed(1), rBotX = +(x + w * 0.08).toFixed(1), rBotY = +(yB + 0.6).toFixed(1);
      const baseD = `M ${xL},${yB} Q ${cLx},${cTy} ${x},${yT} Q ${cRx},${cTy} ${xR},${yB} Q ${x},${+(yB + 1.4).toFixed(1)} ${xL},${yB} Z`;
      const litD = `M ${xL},${yB} Q ${cLx},${cTy} ${x},${yT} Q ${rMidX},${rMidY} ${rBotX},${rBotY} Z`;
      const shdD = `M ${x},${yT} Q ${cRx},${cTy} ${xR},${yB} Q ${+(x + w * 0.45).toFixed(1)},${+(yB + 1.0).toFixed(1)} ${rBotX},${rBotY} Q ${rMidX},${rMidY} ${x},${yT} Z`;
      const forkD = isHero ? ` M ${x},${yT} Q ${rMidX},${rMidY} ${rBotX},${rBotY} M ${rMidX},${rMidY} L ${+(x - w * 0.28).toFixed(1)},${+(yB - 0.4).toFixed(1)}` : "";
      const rimD = `M ${xL},${yB} Q ${cLx},${cTy} ${x},${yT} Q ${cRx},${cTy} ${xR},${yB}${forkD}`;
      const calderaGlow = (style === "volcanic" && isHero)
        ? `<ellipse cx="${x}" cy="${+(yT + 1.1).toFixed(1)}" rx="${+(w * 0.22).toFixed(1)}" ry="0.9" fill="#e85d24" stroke="#261c0e" stroke-width="0.45"/>`
        : "";
      return `<path d="${baseD}" fill="${theme.landBaseCol}"/><path d="${litD}" fill="rgba(182,166,116,0.54)"/><path d="${shdD}" fill="rgba(34,26,14,0.56)"/><path d="${rimD}" fill="none" stroke="#241a0c" stroke-width="${isHero ? '1.05' : '0.88'}" stroke-linecap="round" stroke-linejoin="round"/>${calderaGlow}`;
    }).join("");

    return `
      <path data-mountain-chokepoints="1" d="${massifFootprintD}" fill="rgba(42,34,18,0.42)"/>
      ${this.renderCliffEscarpments(spec.cliffEscarpments)}
      ${orderedArchesSvg}
    `;
  },

  renderRoadNetwork(spec) {
    const r = spec.roads || {};
    const imperialHighwaysD = (r.highways || []).map(pts => catmullSplineD(pts)).join(" ");
    const regionalRoadsD = (r.regional || []).map(pts => catmullSplineD(pts)).join(" ");
    const mountainSwitchbacksD = (r.switchbacks || []).map(pts => catmullSplineD(pts)).join(" ");
    const customWalkD = (ATLAS_INCREMENTAL_CUSTOM_FEATURES.walkways || []).map(w => w.d).join(" ");
    const allImperialD = customWalkD ? `${imperialHighwaysD} ${customWalkD}` : imperialHighwaysD;
    return `
      <path d="${allImperialD} ${regionalRoadsD}" fill="none" stroke="rgba(148,132,88,0.28)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${allImperialD}" fill="none" stroke="#281b0d" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${regionalRoadsD}" fill="none" stroke="#281b0d" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${mountainSwitchbacksD}" fill="none" stroke="#281b0d" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${allImperialD}" fill="none" stroke="#dfd0a4" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${regionalRoadsD}" fill="none" stroke="#d5c496" stroke-width="0.78" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${mountainSwitchbacksD}" fill="none" stroke="#cab786" stroke-width="0.58" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  },

  renderMultiSpeciesFlora(spec) {
    const crownBlob = (cx, cy, r) => `M ${+(cx - r).toFixed(1)},${+(cy + r * 0.2).toFixed(1)} Q ${+(cx - r * 0.9).toFixed(1)},${+(cy - r * 0.85).toFixed(1)} ${cx},${+(cy - r).toFixed(1)} Q ${+(cx + r * 0.9).toFixed(1)},${+(cy - r * 0.85).toFixed(1)} ${+(cx + r).toFixed(1)},${+(cy + r * 0.2).toFixed(1)} Q ${cx},${+(cy + r * 0.95).toFixed(1)} ${+(cx - r).toFixed(1)},${+(cy + r * 0.2).toFixed(1)} Z`;
    const pineSpire = (cx, cy, r) => `M ${cx},${+(cy - r * 1.35).toFixed(1)} L ${+(cx + r * 0.85).toFixed(1)},${+(cy + r * 0.45).toFixed(1)} Q ${cx},${+(cy + r * 0.75).toFixed(1)} ${+(cx - r * 0.85).toFixed(1)},${+(cy + r * 0.45).toFixed(1)} Z`;
    const speciesPalettes = {
      deciduous: { fill: "#455430", hi: "#627544", stroke: "#222c15", shape: crownBlob },
      golden: { fill: "#786832", hi: "#9c8844", stroke: "#332a12", shape: crownBlob },
      pine: { fill: "#2f4436", hi: "#46634f", stroke: "#18241c", shape: pineSpire },
      willow: { fill: "#3c4638", hi: "#525e4c", stroke: "#1c221a", shape: crownBlob }
    };
    const customTrees = (ATLAS_INCREMENTAL_CUSTOM_FEATURES.trees || []).map(t => [t.x, t.y, t.r || 2.4]);
    return (spec.groves || []).map((g, idx) => {
      const pal = speciesPalettes[g.species] || speciesPalettes.deciduous;
      const pts = idx === 0 ? [...(g.pts || []), ...customTrees] : (g.pts || []);
      const shD = pts.map(([cx, cy, cr]) => pal.shape(cx + 0.5, cy + 0.7, cr * 1.05)).join(" ");
      const cD = pts.map(([cx, cy, cr]) => pal.shape(cx, cy, cr)).join(" ");
      const hD = pts.map(([cx, cy, cr]) => pal.shape(cx - 0.35, cy - 0.35, +(cr * 0.54).toFixed(1))).join(" ");
      return `<path d="${shD}" fill="rgba(20,24,12,0.42)"/><path d="${cD}" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="0.35" stroke-linejoin="round"/><path d="${hD}" fill="${pal.hi}" opacity="0.74"/>`;
    }).join("");
  },

  renderOverlandWalledSettlementsAndOrnaments(spec) {
    // 1. Walled Town Footprints visible at ALL zoom levels (1.0x - 4.5x) so roads terminate at walled cities!
    const anchors = typeof ATLAS_OVERLAND_LANDMARK_ANCHORS !== "undefined" ? ATLAS_OVERLAND_LANDMARK_ANCHORS : [];
    const townWallsD = [];
    const townRoofsD = [];
    anchors.forEach(a => {
      if (a.kind === "catacomb" || a.kind === "tower") return;
      const tSpec = (typeof ATLAS_TOWN_FOOTPRINT_SPECS !== "undefined" && (ATLAS_TOWN_FOOTPRINT_SPECS[a.zoneId] || ATLAS_TOWN_FOOTPRINT_SPECS[a.landmarkId])) || { scale: 1.35, shape: "trapezoid_fort" };
      const sc = tSpec.scale * 0.68;
      townWallsD.push(buildTownBespokeWallPathD(a.x, a.y, tSpec.shape, sc));
      const r = +(4.2 * sc).toFixed(1);
      townRoofsD.push(`M ${a.x - r},${a.y - r * 0.6} h ${+(r * 0.85).toFixed(1)} v ${+(r * 0.65).toFixed(1)} h -${+(r * 0.85).toFixed(1)} Z M ${a.x + r * 0.18},${a.y - r * 0.55} h ${+(r * 0.82).toFixed(1)} v ${+(r * 0.62).toFixed(1)} h -${+(r * 0.82).toFixed(1)} Z M ${a.x - r * 0.65},${a.y + r * 0.18} h ${+(r * 1.3).toFixed(1)} v ${+(r * 0.55).toFixed(1)} h -${+(r * 1.3).toFixed(1)} Z`);
    });

    // 2. Curved Province Banners along SVG <path> arcs
    const banners = (spec.ornaments && spec.ornaments.provinceBanners) || [];
    const bannerDefs = banners.map(b => `<path id="atlasProvArc_${b.id}" d="${b.d}" fill="none"/>`).join("");
    const bannerTexts = banners.map(b => `<text font-size="4.4" font-family="Georgia, serif" font-weight="800" fill="rgba(238,226,196,0.52)" letter-spacing="1.6" text-anchor="middle" style="paint-order:stroke fill;stroke:rgba(24,18,10,0.48);stroke-width:0.9px"><textPath href="#atlasProvArc_${b.id}" startOffset="50%">${escapeHtml(b.text)}</textPath></text>`).join("");

    const circleSub = (cx, cy, r) => `M ${+(cx - r).toFixed(1)},${+cy.toFixed(1)} a ${r},${r} 0 1,0 ${+(r * 2).toFixed(1)},0 a ${r},${r} 0 1,0 -${+(r * 2).toFixed(1)},0`;
    const customQ = (ATLAS_INCREMENTAL_CUSTOM_FEATURES.quest_rings || []).map(q => circleSub(q.x, q.y, 7.5)).join(" ");

    return `
      <defs>${bannerDefs}</defs>
      <path d="${townWallsD.join(" ")}" fill="rgba(74,58,36,0.58)" stroke="#22180c" stroke-width="0.78" stroke-linejoin="round"/>
      <path d="${townRoofsD.join(" ")}" fill="rgba(164,92,52,0.68)" stroke="#2b1d0e" stroke-width="0.38"/>
      <g class="atlas-province-banners" pointer-events="none">${bannerTexts}</g>
      ${customQ ? `<path d="${customQ}" fill="rgba(184,166,130,0.18)" stroke="#d4af37" stroke-width="0.9" stroke-dasharray="2.4 1.6"/>` : ""}
    `;
  }
};

// ============================================================================
// 6-Stage Composable Layer Pipeline (ATLAS_CARTO_LAYER_PIPELINE)
// ============================================================================

const ATLAS_CARTO_LAYER_PIPELINE = {
  layer_0_base_elevation_dem(spec, theme) {
    const mainlandAndIslandsD = ATLAS_CARTO_COMPONENTS.compileLandmassD(spec);
    const highlandPlateausD = (spec.plateaus || []).map(pts => catmullSplineD(pts, true)).join(" ");
    const sunkenBasinsD = (spec.basins || []).map(pts => catmullSplineD(pts, true)).join(" ");
    const compassSvg = ((spec.ornaments && spec.ornaments.compassRoses) || []).map(c => ATLAS_CARTO_COMPONENTS.renderCompassRose(c)).join("");
    const maelstromSvg = ((spec.ornaments && spec.ornaments.maelstroms) || []).map(m => ATLAS_CARTO_COMPONENTS.renderSeaMaelstrom(m)).join("");
    return `
      <defs>
        <filter id="atlasVectorParchmentGrain" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.032" numOctaves="4" seed="14" result="noise"/>
          <feColorMatrix type="matrix" values="0.18 0 0 0 0.34  0 0.16 0 0 0.31  0 0 0.10 0 0.19  0 0 0 0.26 0" in="noise" result="earthTint"/>
          <feBlend mode="multiply" in="SourceGraphic" in2="earthTint"/>
        </filter>
        <filter id="atlasSoftTerraBlur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="4.2"/>
        </filter>
        <radialGradient id="atlasParchmentVignette" cx="50%" cy="50%" r="65%">
          <stop offset="60%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="100%" stop-color="rgba(24,18,10,0.34)"/>
        </radialGradient>
        <clipPath id="atlasMainlandClip"><path d="${mainlandAndIslandsD}"/></clipPath>
      </defs>
      <rect x="0" y="0" width="1040" height="500" fill="${theme.seaCol}"/>
      ${ATLAS_CARTO_COMPONENTS.renderCoastalRippleRings(mainlandAndIslandsD, theme)}
      ${compassSvg}
      ${maelstromSvg}
      <path d="${mainlandAndIslandsD}" fill="${theme.landBaseCol}" stroke="#231c11" stroke-width="1.8" stroke-linejoin="round" filter="url(#atlasVectorParchmentGrain)"/>
      <g filter="url(#atlasSoftTerraBlur)">
        <path d="${highlandPlateausD}" fill="${theme.landPlateauCol}" opacity="0.72"/>
        <path d="${sunkenBasinsD}" fill="${theme.landBasinCol}" opacity="0.78"/>
        ${ATLAS_CARTO_COMPONENTS.renderBiomeMosaics(spec.biomes)}
      </g>
      <path d="${mainlandAndIslandsD}" fill="none" stroke="#231c11" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="0" y="0" width="1040" height="500" fill="url(#atlasParchmentVignette)"/>
      <path data-l2-geodata-grid="1" d="M 68,0 L 68,500 M 136,0 L 136,500 M 204,0 L 204,500 M 272,0 L 272,500 M 340,0 L 340,500 M 408,0 L 408,500 M 476,0 L 476,500 M 544,0 L 544,500 M 612,0 L 612,500 M 680,0 L 680,500 M 748,0 L 748,500 M 816,0 L 816,500 M 884,0 L 884,500 M 952,0 L 952,500 M 1020,0 L 1020,500 M 0,62 L 1040,62 M 0,124 L 1040,124 M 0,186 L 1040,186 M 0,248 L 1040,248 M 0,310 L 1040,310 M 0,372 L 1040,372 M 0,434 L 1040,434 M 0,496 L 1040,496" fill="none" stroke="rgba(36,28,16,0.15)" stroke-width="0.4"/>
      <text font-size="3.6" font-weight="700" font-family="serif" fill="rgba(52,44,28,0.42)"><tspan x="6" y="11">15.10</tspan><tspan x="74" y="11">16.10</tspan><tspan x="142" y="11">17.10</tspan><tspan x="210" y="11">18.10</tspan><tspan x="278" y="11">19.10</tspan><tspan x="346" y="11">20.10</tspan><tspan x="414" y="11">21.10</tspan><tspan x="482" y="11">22.10</tspan><tspan x="550" y="11">23.10</tspan><tspan x="618" y="11">24.10</tspan><tspan x="686" y="11">25.10</tspan><tspan x="754" y="11">26.10</tspan><tspan x="822" y="11">27.10</tspan><tspan x="890" y="11">28.10</tspan><tspan x="958" y="11">29.10</tspan><tspan x="6" y="197">15.13</tspan><tspan x="210" y="197">18.13</tspan><tspan x="414" y="197">21.13</tspan><tspan x="618" y="197">24.13</tspan><tspan x="822" y="197">27.13</tspan><tspan x="6" y="383">15.16</tspan><tspan x="210" y="383">18.16</tspan><tspan x="414" y="383">21.16</tspan><tspan x="618" y="383">24.16</tspan><tspan x="822" y="383">27.16</tspan></text>
    `;
  },

  layer_1_hydrology_splines(spec, theme) {
    return ATLAS_CARTO_COMPONENTS.renderHydrologyNetwork(spec, theme);
  },

  layer_2_topography_cliffs_and_highlands(spec, theme) {
    return ATLAS_CARTO_COMPONENTS.renderTopographyAndEscarpments(spec, theme);
  },

  layer_3_road_and_walkway_network(spec) {
    return ATLAS_CARTO_COMPONENTS.renderRoadNetwork(spec);
  },

  layer_4_foliage_and_canopy_scatters(spec) {
    return ATLAS_CARTO_COMPONENTS.renderMultiSpeciesFlora(spec);
  },

  layer_5_architectural_compounds_and_quest_rings(spec) {
    return ATLAS_CARTO_COMPONENTS.renderOverlandWalledSettlementsAndOrnaments(spec);
  }
};

function buildOverlandComposableLayerInnerSvg(layerId, isL2 = true) {
  const theme = {
    seaCol: isL2 ? "#aeb4a2" : "#0f233c",
    shelfCol: isL2 ? "#989e8c" : "rgba(30,64,115,0.42)",
    rippleOuter: isL2 ? "rgba(74,82,66,0.16)" : "rgba(56,189,248,0.08)",
    rippleMid: isL2 ? "rgba(62,70,54,0.26)" : "rgba(56,189,248,0.14)",
    rippleInner: isL2 ? "rgba(48,54,40,0.42)" : "rgba(56,189,248,0.22)",
    landBaseCol: isL2 ? "#655f3d" : "#25392c",
    landBasinCol: isL2 ? "#4d4a2d" : "#1b2e22",
    landPlateauCol: isL2 ? "#7b724b" : "#3b4a34"
  };
  const spec = getActiveAtlasWorldMapSpec();
  const stageFn = ATLAS_CARTO_LAYER_PIPELINE[layerId];
  return typeof stageFn === "function" ? stageFn(spec, theme) : "";
}

// Zero-Rebuild Incremental Layer Patch: updates ONLY the target <g data-layer-id="..."> in < 5ms
// on BOTH Field Tactical Blueprint and Overland World Map without calling render()!
function patchSingleComposableLayerInPlace(layerId) {
  ATLAS_INCREMENTAL_LAYER_PATCH_COUNT += 1;
  if (typeof document === 'undefined') return { patched: false, layerId, patchCount: ATLAS_INCREMENTAL_LAYER_PATCH_COUNT, fullRebuildCount: ATLAS_FULL_MAP_REBUILD_COUNT };
  const sp = (typeof DATA !== 'undefined' && DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const entry = resolveActiveFieldOrFortEntry() || (getAllAtlasFieldEntries(tatlas)[0]) || {};
  const isFort = Boolean(entry.fortress_tactical_blueprint && !entry.field_tactical_blueprint);
  const bp = entry.field_tactical_blueprint || entry.fortress_tactical_blueprint || {};
  let patchedAny = false;
  const fieldEl = document.getElementById(`atlasFieldComposable_${layerId}`);
  if (fieldEl) {
    fieldEl.innerHTML = buildFieldComposableLayerInnerSvg(layerId, entry, bp, isFort);
    fieldEl.style.display = ATLAS_COMPOSABLE_LAYER_VISIBILITY[layerId] !== false ? 'inline' : 'none';
    patchedAny = true;
  }
  const overlandEl = document.getElementById(`atlasOverlandComposable_${layerId}`);
  if (overlandEl) {
    overlandEl.innerHTML = buildOverlandComposableLayerInnerSvg(layerId, STUDIO_CARTO_THEME === 'l2hub');
    overlandEl.style.display = ATLAS_COMPOSABLE_LAYER_VISIBILITY[layerId] !== false ? 'inline' : 'none';
    patchedAny = true;
  }
  return {
    patched: patchedAny,
    layerId,
    patchCount: ATLAS_INCREMENTAL_LAYER_PATCH_COUNT,
    fullRebuildCount: ATLAS_FULL_MAP_REBUILD_COUNT
  };
}

function toggleComposableFieldLayer(layerId) {
  if (!layerId) return;
  const cur = ATLAS_COMPOSABLE_LAYER_VISIBILITY[layerId] !== false;
  ATLAS_COMPOSABLE_LAYER_VISIBILITY[layerId] = !cur;
  const res = patchSingleComposableLayerInPlace(layerId);
  if (!res.patched) render();
}

let ATLAS_CUSTOM_FEATURE_HISTORY_STACK = [];

function addIncrementalComposableFeature(kind) {
  const norm = String(kind || 'walkway').toLowerCase();
  let targetLayerId = 'layer_3_road_and_walkway_network';
  const isOverland = isStudioMapOverland();
  if (norm === 'walkway' || norm === 'walkways') {
    const idx = ATLAS_INCREMENTAL_CUSTOM_FEATURES.walkways.length + 1;
    const d = isOverland
      ? `M 432,422 Q ${455 + (idx * 18) % 140},${395 - (idx * 14) % 70} ${515 + (idx * 22) % 160},${368 + (idx * 16) % 65}`
      : `M 476,242 Q ${320 + (idx * 65) % 420},${140 + (idx * 55) % 240} ${220 + (idx * 85) % 620},${110 + (idx * 75) % 300}`;
    ATLAS_INCREMENTAL_CUSTOM_FEATURES.walkways.push({ id: `custom-walkway-${idx}`, d, width: 4.5 });
    ATLAS_CUSTOM_FEATURE_HISTORY_STACK.push({ bucket: 'walkways', layerId: 'layer_3_road_and_walkway_network' });
    targetLayerId = 'layer_3_road_and_walkway_network';
  } else if (norm === 'river' || norm === 'rivers') {
    const idx = ATLAS_INCREMENTAL_CUSTOM_FEATURES.rivers.length + 1;
    const d = isOverland
      ? `M ${395 + (idx * 35) % 260},318 C ${415 + (idx * 30) % 240},358 ${435 + (idx * 25) % 240},398 ${455 + (idx * 28) % 240},452`
      : `M ${180 + (idx * 95) % 680},48 C ${260 + (idx * 70) % 520},165 ${390 + (idx * 50) % 360},215 482,248`;
    ATLAS_INCREMENTAL_CUSTOM_FEATURES.rivers.push({ id: `custom-river-${idx}`, d, width: 8 });
    ATLAS_CUSTOM_FEATURE_HISTORY_STACK.push({ bucket: 'rivers', layerId: 'layer_1_hydrology_splines' });
    targetLayerId = 'layer_1_hydrology_splines';
  } else if (norm === 'tree' || norm === 'trees') {
    const idx = ATLAS_INCREMENTAL_CUSTOM_FEATURES.trees.length + 1;
    const tx = isOverland ? (365 + (idx * 43) % 320) : (160 + (idx * 83) % 720);
    const ty = isOverland ? (328 + (idx * 29) % 120) : (95 + (idx * 67) % 310);
    ATLAS_INCREMENTAL_CUSTOM_FEATURES.trees.push({ x: tx, y: ty, r: isOverland ? 2.4 : 6 });
    ATLAS_CUSTOM_FEATURE_HISTORY_STACK.push({ bucket: 'trees', layerId: 'layer_4_foliage_and_canopy_scatters' });
    targetLayerId = 'layer_4_foliage_and_canopy_scatters';
  } else if (norm === 'quest' || norm === 'quest_ring' || norm === 'quest_rings') {
    const idx = ATLAS_INCREMENTAL_CUSTOM_FEATURES.quest_rings.length + 1;
    ATLAS_INCREMENTAL_CUSTOM_FEATURES.quest_rings.push({
      x: isOverland ? (390 + (idx * 55) % 290) : (260 + (idx * 110) % 540),
      y: isOverland ? (335 + (idx * 35) % 110) : (135 + (idx * 75) % 230),
      label: `Custom Quest Objective #${idx}`
    });
    ATLAS_CUSTOM_FEATURE_HISTORY_STACK.push({ bucket: 'quest_rings', layerId: 'layer_5_architectural_compounds_and_quest_rings' });
    targetLayerId = 'layer_5_architectural_compounds_and_quest_rings';
  }
  return patchSingleComposableLayerInPlace(targetLayerId);
}

function undoLastIncrementalComposableFeature() {
  const last = ATLAS_CUSTOM_FEATURE_HISTORY_STACK.pop();
  if (!last) {
    for (const [b, lid] of [
      ['walkways', 'layer_3_road_and_walkway_network'],
      ['rivers', 'layer_1_hydrology_splines'],
      ['trees', 'layer_4_foliage_and_canopy_scatters'],
      ['quest_rings', 'layer_5_architectural_compounds_and_quest_rings']
    ]) {
      if ((ATLAS_INCREMENTAL_CUSTOM_FEATURES[b] || []).length > 0) {
        ATLAS_INCREMENTAL_CUSTOM_FEATURES[b].pop();
        return patchSingleComposableLayerInPlace(lid);
      }
    }
    return { undone: false };
  }
  const arr = ATLAS_INCREMENTAL_CUSTOM_FEATURES[last.bucket];
  if (Array.isArray(arr) && arr.length > 0) arr.pop();
  const res = patchSingleComposableLayerInPlace(last.layerId);
  return { undone: true, bucket: last.bucket, layerId: last.layerId, ...res };
}

function saveIncrementalComposableFeaturesToDisk() {
  ATLAS_SAVED_LAYER_SNAPSHOT_COUNT += 1;
  const sp = (typeof DATA !== 'undefined' && DATA && DATA.studioPerspectives) || {};
  if (!sp.mapFeatureLayers) sp.mapFeatureLayers = {};
  const snapshot = {
    walkways: [...(ATLAS_INCREMENTAL_CUSTOM_FEATURES.walkways || [])],
    rivers: [...(ATLAS_INCREMENTAL_CUSTOM_FEATURES.rivers || [])],
    trees: [...(ATLAS_INCREMENTAL_CUSTOM_FEATURES.trees || [])],
    quest_rings: [...(ATLAS_INCREMENTAL_CUSTOM_FEATURES.quest_rings || [])]
  };
  sp.mapFeatureLayers.persisted_custom_features = snapshot;
  if (typeof fetch === 'function') {
    try {
      fetch('/api/studio/map-layers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persisted_custom_features: snapshot })
      }).catch(() => {});
    } catch (_e) {}
  }
  const badgeEl = typeof document !== 'undefined' ? document.getElementById('atlasComposableSaveStatusBadge') : null;
  if (badgeEl) {
    badgeEl.textContent = `SAVED SNAPSHOT #${ATLAS_SAVED_LAYER_SNAPSHOT_COUNT}`;
  }
  return {
    ok: true,
    saved: true,
    savedSnapshotCount: ATLAS_SAVED_LAYER_SNAPSHOT_COUNT,
    persisted_custom_features: snapshot
  };
}

function renderCleanVectorContinentReliefSvg(isL2) {
  const layerIds = [
    'layer_0_base_elevation_dem',
    'layer_1_hydrology_splines',
    'layer_2_topography_cliffs_and_highlands',
    'layer_3_road_and_walkway_network',
    'layer_4_foliage_and_canopy_scatters',
    'layer_5_architectural_compounds_and_quest_rings'
  ];
  return `<g id="atlasCleanVectorContinentRelief" pointer-events="none">${layerIds.map(lid => {
    const vis = ATLAS_COMPOSABLE_LAYER_VISIBILITY[lid] !== false;
    return `<g id="atlasOverlandComposable_${lid}" class="atlas-composable-layer" data-layer-id="${lid}" data-incremental-rebuild="isolated" style="display:${vis ? 'inline' : 'none'}">${buildOverlandComposableLayerInnerSvg(lid, isL2)}</g>`;
  }).join('')}</g>`;
}

// Canonical Town Architectural Footprint & Size Scale Catalog (Original Cradle of Embers Lore)
const ATLAS_TOWN_FOOTPRINT_SPECS = {
  "zone-town-crown-beacon": { id: "town-crown-beacon", scale: 2.35, shape: "imperial_pentagon", badge: "2.35× Astral Pentagon Citadel", wallCol: "#facc15", roofCol: "#991b1b" },
  "town-crown-beacon": { id: "town-crown-beacon", scale: 2.35, shape: "imperial_pentagon", badge: "2.35× Astral Pentagon Citadel", wallCol: "#facc15", roofCol: "#991b1b" },
  "zone-town-starfall-haven": { id: "town-starfall-haven", scale: 2.05, shape: "cliff_keep_harbor", badge: "2.05× Split Cliff & Tether Harbor", wallCol: "#38bdf8", roofCol: "#1e3a8a" },
  "town-starfall-haven": { id: "town-starfall-haven", scale: 2.05, shape: "cliff_keep_harbor", badge: "2.05× Split Cliff & Tether Harbor", wallCol: "#38bdf8", roofCol: "#1e3a8a" },
  "zone-town-pinion-terminus": { id: "town-pinion-terminus", scale: 1.95, shape: "diamond_bazaar", badge: "1.95× Clockwork Gear Hub", wallCol: "#fbbf24", roofCol: "#92400e" },
  "town-pinion-terminus": { id: "town-pinion-terminus", scale: 1.95, shape: "diamond_bazaar", badge: "1.95× Clockwork Gear Hub", wallCol: "#fbbf24", roofCol: "#92400e" },
  "zone-town-inductor-switchyard": { id: "town-inductor-switchyard", scale: 1.78, shape: "radial_moat_spire", badge: "1.78× Stepped Caldera Switchyard", wallCol: "#f87171", roofCol: "#7f1d1d" },
  "zone-town-kilnwatch-bastion": { id: "town-kilnwatch-bastion", scale: 1.65, shape: "trapezoid_fort", badge: "1.65× Trapezoid Kiln Bastion", wallCol: "#fde047", roofCol: "#991b1b" },
  "town-kilnwatch-bastion": { id: "town-kilnwatch-bastion", scale: 1.65, shape: "trapezoid_fort", badge: "1.65× Trapezoid Kiln Bastion", wallCol: "#fde047", roofCol: "#991b1b" },
  "zone-town-escapement-anvil": { id: "town-escapement-anvil", scale: 1.55, shape: "oren_cross_bastion", badge: "1.55× Escapement Cross Garrison", wallCol: "#fb923c", roofCol: "#7c2d12" },
  "zone-town-brass-bell-keep": { id: "town-brass-bell-keep", scale: 1.55, shape: "oren_cross_bastion", badge: "1.55× Brass-Bell Keep", wallCol: "#fb923c", roofCol: "#7c2d12" },
  "zone-town-wick-market-commons": { id: "town-wick-market-commons", scale: 1.45, shape: "diamond_bazaar", badge: "1.45× Wick-Market Commons", wallCol: "#fbbf24", roofCol: "#92400e" },
  "zone-town-glaze-barge-quay": { id: "town-glaze-barge-quay", scale: 1.42, shape: "canal_octagon", badge: "1.42× Canal-Octagon Quay", wallCol: "#22d3ee", roofCol: "#0e7490" },
  "zone-town-glass-mire-sanctuary": { id: "town-glass-mire-sanctuary", scale: 1.42, shape: "canal_octagon", badge: "1.42× Glass-Mire Canal Sanctuary", wallCol: "#22d3ee", roofCol: "#0e7490" },
  "zone-town-torque-balance-citadel": { id: "town-torque-balance-citadel", scale: 1.32, shape: "hunters_canyon_lodge", badge: "1.32× Torque-Balance Lodge", wallCol: "#a3e635", roofCol: "#365314" },
  "zone-town-lantern-hollow": { id: "town-lantern-hollow", scale: 1.30, shape: "walled_harbor_pier", badge: "1.30× Lantern Hollow Port", wallCol: "#fde047", roofCol: "#854d0e" },
  "town-lantern-hollow": { id: "town-lantern-hollow", scale: 1.30, shape: "walled_harbor_pier", badge: "1.30× Lantern Hollow Port", wallCol: "#fde047", roofCol: "#854d0e" },
  "zone-town-draft-kiln-post": { id: "town-draft-kiln-post", scale: 1.18, shape: "spiked_palisade", badge: "1.18× Draft-Kiln War Palisade", wallCol: "#f97316", roofCol: "#9a3412" },
  "town-draft-kiln-post": { id: "town-draft-kiln-post", scale: 1.18, shape: "spiked_palisade", badge: "1.18× Draft-Kiln War Palisade", wallCol: "#f97316", roofCol: "#9a3412" },
  "zone-town-root-train-roundhouse": { id: "town-root-train-roundhouse", scale: 1.15, shape: "quarry_rail_ring", badge: "1.15× Root-Train Rail Roundhouse", wallCol: "#eab308", roofCol: "#713f12" },
  "town-root-train-roundhouse": { id: "town-root-train-roundhouse", scale: 1.15, shape: "quarry_rail_ring", badge: "1.15× Strip-Mine Rail Roundhouse", wallCol: "#eab308", roofCol: "#713f12" },
  "zone-town-porcelain-loom": { id: "town-porcelain-loom-sanctuary", scale: 1.04, shape: "crescent_lagoon", badge: "1.04× Porcelain Loom Lagoon", wallCol: "#34d399", roofCol: "#065f46" },
  "town-porcelain-loom-sanctuary": { id: "town-porcelain-loom-sanctuary", scale: 1.04, shape: "crescent_lagoon", badge: "1.04× Porcelain Loom Lagoon", wallCol: "#34d399", roofCol: "#065f46" },
  "zone-town-carillon-belfry": { id: "town-carillon-hearth-belfry", scale: 1.00, shape: "sunken_gorge_temple", badge: "1.00× Carillon Hearth Belfry", wallCol: "#c084fc", roofCol: "#4c1d95" },
  "town-carillon-hearth-belfry": { id: "town-carillon-hearth-belfry", scale: 1.00, shape: "sunken_gorge_temple", badge: "1.00× Carillon Hearth Belfry", wallCol: "#c084fc", roofCol: "#4c1d95" },
  "zone-town-cinnamon-mill": { id: "town-cinnamon-mill-haven", scale: 0.85, shape: "windmill_bluff", badge: "0.85× Cinnamon-Mill Bluff", wallCol: "#86efac", roofCol: "#166534" },
  "town-cinnamon-mill-haven": { id: "town-cinnamon-mill-haven", scale: 0.85, shape: "windmill_bluff", badge: "0.85× Cinnamon-Mill Bluff", wallCol: "#86efac", roofCol: "#166534" },
  "zone-town-cinder-gate": { id: "town-cinder-gate-encampment", scale: 0.82, shape: "nomad_yurt_ring", badge: "0.82× Cinder-Gate Encampment", wallCol: "#fdba74", roofCol: "#7c2d12" },
  "zone-town-salt-anchor-wharf": { id: "town-salt-anchor-wharf", scale: 0.78, shape: "unwalled_hamlet", badge: "0.78× Salt-Anchor Wharf", wallCol: "#cbd5e1", roofCol: "#334155" }
};

// 32 Hunting & Fortress Zone Sub-Structures (100% Original Cradle of Embers Lore Names)
const ATLAS_MOB_FARM_SUB_STRUCTURES = {
  "zone-field-clover-south-gate": { kind: "outpost", scale: 0.76, sx: 1.05, sy: 0.92, icon: "⛺", tag: "Outpost", label: "Clover-Dew South Meadow", raids: [], buildings: ["#1 Guard Tent", "#2 Barracks", "#3 Watchtower", "#4 Ration Post"] },
  "zone-field-kiln-east-orchard": { kind: "village", scale: 0.94, sx: 1.18, sy: 0.88, icon: "🏘️", tag: "Village", label: "Kiln-East Cider Orchard", raids: [10], buildings: ["#1 Farmhouse", "#2 Cider Barn", "#3 Granary", "#4 Well"] },
  "zone-field-celadon-causeway": { kind: "tower", scale: 0.86, sx: 1.32, sy: 0.78, icon: "🗼", tag: "Tower", label: "Celadon Glaze Causeway", raids: [], buildings: ["#1 Spire", "#2 Wardens", "#3 Brazier", "#4 Shrine"] },
  "zone-field-firebrick-duct": { kind: "outpost", scale: 0.92, sx: 0.88, sy: 1.24, icon: "⛺", tag: "Outpost", label: "Firebrick Duct Encampment", raids: [], buildings: ["#1 War-Tent", "#2 Stockade", "#3 Drum Tower", "#4 Forge"] },
  "zone-field-resin-arch-tunnel": { kind: "cave", scale: 0.82, sx: 1.25, sy: 0.82, icon: "🕳️", tag: "Cave", label: "Resin-Arch Root Tunnel", raids: [12], buildings: ["#1 Cave Maw", "#2 Miner Hut", "#3 Ore Hoist", "#4 Lamp Post"] },
  "zone-field-cobalt-sandbar-ford": { kind: "village", scale: 1.08, sx: 1.35, sy: 0.84, icon: "🏘️", tag: "Village", label: "Cobalt Sandbar Ford", raids: [13], buildings: ["#1 Longhouse", "#2 Net Pier", "#3 Boathouse", "#4 Tide Altar"] },
  "zone-field-chime-pipe-colonnade": { kind: "tower", scale: 1.16, sx: 1.22, sy: 1.05, icon: "🗼", tag: "Tower", label: "Chime-Pipe Colonnade", raids: [], buildings: ["#1 Obelisk", "#2 Sanctum", "#3 Cell", "#4 Pavilion"] },
  "zone-field-apricot-aqueduct-terrace": { kind: "stronghold", scale: 1.02, sx: 1.28, sy: 0.86, icon: "🏯", tag: "Stronghold", label: "Apricot Aqueduct Terrace", raids: [12], buildings: ["#1 Brigand Keep", "#2 Loot Vault", "#3 Gatehouse", "#4 Tavern"] },
  "zone-field-cinnamon-bark-viaduct": { kind: "outpost", scale: 0.88, sx: 1.30, sy: 0.80, icon: "⛺", tag: "Outpost", label: "Cinnamon-Bark Viaduct", raids: [14], buildings: ["#1 Outrider HQ", "#2 Scout Tent", "#3 Toll Gate", "#4 Wagon Yard"] },
  "zone-field-ginger-aqueduct-bridge": { kind: "beast_farm", scale: 1.12, sx: 1.15, sy: 1.08, icon: "🐗", tag: "Beast Farm", label: "Ginger Aqueduct Pastures", raids: [14], buildings: ["#1 Timber Barn", "#2 Feed Silo", "#3 Corral", "#4 Cabin"] },
  "zone-field-cinder-apron": { kind: "outpost", scale: 1.42, sx: 1.34, sy: 1.12, icon: "🏘️", tag: "Grounds", label: "Cinder-Apron Ash Grounds", raids: [16], buildings: ["#1 Ash Hill", "#2 Ruin Chapel", "#3 Kiln Arch", "#4 Crypt Hut"] },
  "zone-field-brass-spur-ridge": { kind: "stronghold", scale: 1.28, sx: 1.44, sy: 0.82, icon: "🏯", tag: "Stronghold", label: "Brass-Spur Ridge Bastion", raids: [18], buildings: ["#1 Warlord Hall", "#2 Armory", "#3 Bastion", "#4 Stockade"] },
  "zone-field-caldera-rim": { kind: "caldera", scale: 1.58, sx: 1.18, sy: 1.18, icon: "🌋", tag: "Caldera", label: "Caldera Rim Smeltery", raids: [26], buildings: ["#1 Magma Altar", "#2 Smelter", "#3 Slag Post", "#4 Bunker"] },
  "zone-field-leyden-causeway": { kind: "cave", scale: 1.68, sx: 1.48, sy: 0.94, icon: "🕳️", tag: "Cave", label: "Leyden Capacitor Causeway", raids: [28], buildings: ["#1 Rib Grotto", "#2 Hunter Camp", "#3 Condenser", "#4 Wyrm Altar"] },
  "zone-field-tether-causeway": { kind: "tower", scale: 1.36, sx: 1.26, sy: 1.06, icon: "🗼", tag: "Shrine Tower", label: "Star-Tether Causeway", raids: [33], buildings: ["#1 Eye-Spire", "#2 Cloister", "#3 Pylon", "#4 Rotunda"] },
  "zone-field-aurora-tether": { kind: "caldera", scale: 1.72, sx: 1.32, sy: 1.22, icon: "🌋", tag: "Caldera", label: "Aurora Tether Crucible", raids: [37], buildings: ["#1 Foundry", "#2 Anvil Hall", "#3 Sluice", "#4 Flame Shrine"] },
  "zone-field-whispering-mire": { kind: "outpost", scale: 1.48, sx: 1.36, sy: 1.14, icon: "⛺", tag: "Outpost", label: "Whispering Spore Mire", raids: [24], buildings: ["#1 Ranger Post", "#2 Duckblind", "#3 Spore Lab", "#4 Reed Tower"] },
  "zone-field-slag-chasm": { kind: "cave", scale: 1.18, sx: 1.42, sy: 0.78, icon: "🕳️", tag: "Cave", label: "Slag-Chasm Excavations", raids: [27], buildings: ["#1 Chasm Gate", "#2 Ore Crane", "#3 Relic Shed", "#4 Deep Lift"] },
  "zone-field-astrolabe-rift": { kind: "tower", scale: 1.34, sx: 1.16, sy: 1.16, icon: "🗼", tag: "Tower", label: "Astrolabe Rift Observatory", raids: [35], buildings: ["#1 Observatory", "#2 Star Hall", "#3 Beacon", "#4 Quarters"] },
  "zone-field-siphon-sluice": { kind: "stronghold", scale: 1.06, sx: 0.92, sy: 1.28, icon: "🏯", tag: "Stronghold", label: "Siphon-Sluice Pumping Keep", raids: [31], buildings: ["#1 Sluice Keep", "#2 Pump Bastion", "#3 Barracks", "#4 Watchtower"] },
  "zone-field-metronome-bridge": { kind: "outpost", scale: 0.72, sx: 1.46, sy: 0.68, icon: "⛺", tag: "Outpost", label: "Metronome Toll Bridge", raids: [45], buildings: ["#1 Gatehouse", "#2 Guardhouse", "#3 Customs", "#4 Turret"] },
  "zone-field-spiral-wormway-ramp": { kind: "sepulcher", scale: 1.22, sx: 1.08, sy: 1.24, icon: "⚰️", tag: "Sepulcher", label: "Spiral Wormway Sepulcher", raids: [52], buildings: ["#1 Conquerors", "#2 Rulers", "#3 Sages", "#4 Judges"] },
  "zone-field-orrery-bridge": { kind: "sepulcher", scale: 1.52, sx: 1.38, sy: 1.04, icon: "⚰️", tag: "Tomb", label: "Celestial Orrery Bridge", raids: [58], buildings: ["#1 Nave", "#2 Orrery Dome", "#3 Ossuary", "#4 Tomb Gate"] },
  "zone-field-kelp-spiral-reef": { kind: "cave", scale: 1.44, sx: 1.28, sy: 1.12, icon: "🕳️", tag: "Sea Cave", label: "Kelp-Spiral Abyssal Reef", raids: [70], buildings: ["#1 Coral Dome", "#2 Diving Pier", "#3 Pearl Vault", "#4 Vent"] },
  "zone-harbor-lantern-ferry-pier": { kind: "outpost", scale: 0.68, sx: 1.32, sy: 0.76, icon: "⛺", tag: "Harbor Post", label: "Lantern Ferry Pier", raids: [18], buildings: ["#1 Harbor HQ", "#2 Warehouse", "#3 Lighthouse", "#4 Ferry Pier"] },
  "zone-harbor-glaze-barge-airship-dock": { kind: "tower", scale: 0.84, sx: 1.28, sy: 0.84, icon: "🗼", tag: "Sky-Dock", label: "Glaze-Barge Sky-Dock", raids: [42], buildings: ["#1 Mooring Pylon", "#2 Aether Tank", "#3 Concourse", "#4 Wind Spire"] },
  "zone-clanhall-kilnwatch-accord": { kind: "stronghold", scale: 0.96, sx: 1.12, sy: 1.06, icon: "🏯", tag: "Clan Hall", label: "Kilnwatch Accord Hall", raids: [20], buildings: ["#1 Accord Hall", "#2 Great-Room", "#3 Siege Vault", "#4 Teleport"] },
  "zone-clanhall-inductor-conclave": { kind: "caldera", scale: 1.04, sx: 1.16, sy: 1.08, icon: "🌋", tag: "Forge Hall", label: "Inductor Conclave Citadel", raids: [34], buildings: ["#1 Reactor Hall", "#2 Brass Forge", "#3 Trophy Room", "#4 Dynamo Gate"] },
  "zone-fortress-shanty-kiln": { kind: "stronghold", scale: 0.88, sx: 1.18, sy: 0.92, icon: "🏯", tag: "Fortress", label: "Shanty-Kiln Coastal Fort", raids: [22], buildings: ["#1 Flag Keep", "#2 Ballista", "#3 Barracks", "#4 Gatehouse"] },
  "zone-fortress-floran-saffron": { kind: "beast_farm", scale: 0.92, sx: 1.22, sy: 0.90, icon: "🐗", tag: "Ranch Keep", label: "Saffron Mill Redoubt", raids: [24], buildings: ["#1 Saffron Keep", "#2 Stables", "#3 Granary", "#4 Watchtower"] },
  "zone-fortress-dragonspine-cog": { kind: "tower", scale: 1.14, sx: 1.36, sy: 0.86, icon: "🗼", tag: "Fortress", label: "Dragonspine Cog Fortress", raids: [38], buildings: ["#1 Citadel", "#2 Harpoon Bay", "#3 Cog Hoist", "#4 Ridge Gate"] },
  "zone-fortress-cloud-halo": { kind: "sepulcher", scale: 1.26, sx: 1.20, sy: 1.12, icon: "⚰️", tag: "Sanctum", label: "Cloud-Halo Cloister", raids: [68], buildings: ["#1 Silent Keep", "#2 Bell-Tower", "#3 Scriptorium", "#4 Sky Gate"] }
};

// Companion Sub-Landmarks (Original Cradle of Embers Lore & Architecture)
const ATLAS_COMPANION_SUB_LANDMARKS = [
  { id: "sub-ember-ruins", name: "First-Kiln Ruins", x: 38, y: 388, kind: "ruins" },
  { id: "sub-chime-cascade", name: "Chime-cascade Falls", x: 42, y: 432, kind: "lake" },
  { id: "sub-bellows-collegium", name: "Bellows Arcanum", x: 84, y: 424, kind: "school" },
  { id: "sub-ash-drill-hall", name: "Ash-Guard Drill Hall", x: 92, y: 444, kind: "school" },
  { id: "sub-cinder-port", name: "Cinder-Cape Anchorage", x: 118, y: 442, kind: "harbor" },
  { id: "sub-slag-outpost", name: "Slag-Hound Stockade", x: 146, y: 388, kind: "tent" },
  { id: "sub-gale-bluff", name: "Gale-Vane Bluff", x: 122, y: 368, kind: "pass" },
  { id: "sub-cinnamon-keep", name: "Cinnamon-Spur Keep", x: 242, y: 342, kind: "castle" },
  { id: "sub-broken-viaduct", name: "Broken Viaduct", x: 196, y: 364, kind: "ruins" },
  { id: "sub-sunken-kiln", name: "Sunken Fire-Shrine", x: 162, y: 428, kind: "catacomb" },
  { id: "sub-mirror-tarn", name: "Mirror-Glaze Tarn", x: 214, y: 350, kind: "lake" },
  { id: "sub-cobalt-bastion", name: "Cobalt Ward Bastion", x: 256, y: 274, kind: "fortress" },
  { id: "sub-reed-fen", name: "Reed-Pipe Fen", x: 124, y: 246, kind: "lake" },
  { id: "sub-vesper-scholarium", name: "Vesper Bell Scholarium", x: 76, y: 248, kind: "catacomb" },
  { id: "sub-resonator-altar", name: "Resonator Plinth", x: 144, y: 272, kind: "obelisk" },
  { id: "sub-saffron-mills", name: "Saffron Windmills", x: 354, y: 454, kind: "windmill" },
  { id: "sub-lantern-citadel", name: "Lantern-Ward Citadel", x: 396, y: 438, kind: "castle" },
  { id: "sub-terrace-downs", name: "Terrace Downs", x: 404, y: 392, kind: "pass" },
  { id: "sub-smuggler-hollow", name: "Smuggler's Hollow", x: 422, y: 336, kind: "tent" },
  { id: "sub-pilgrim-ossuary", name: "Pilgrim's Ossuary", x: 446, y: 368, kind: "catacomb" },
  { id: "sub-ash-vault", name: "Vault of the Unfired", x: 432, y: 404, kind: "catacomb" },
  { id: "sub-salt-crypt", name: "Salt-Tide Crypt", x: 452, y: 462, kind: "catacomb" },
  { id: "sub-aqueduct-redoubt", name: "Aqueduct Redoubt", x: 486, y: 382, kind: "fortress" },
  { id: "sub-amber-apiary", name: "Amber Apiary", x: 392, y: 474, kind: "tent" },
  { id: "sub-wick-colosseum", name: "Wick-Market Arena", x: 522, y: 384, kind: "arena" },
  { id: "sub-porcelain-keep", name: "Porcelain Citadel", x: 598, y: 392, kind: "castle" },
  { id: "sub-cinder-pass", name: "Cinder-throat Pass", x: 518, y: 342, kind: "pass" },
  { id: "sub-glaze-gardens", name: "Glaze-Bloom Gardens", x: 576, y: 356, kind: "ruins" },
  { id: "sub-loom-ossuary", name: "Loom-Weaver Ossuary", x: 618, y: 368, kind: "catacomb" },
  { id: "sub-spur-watch", name: "Brass-Spur Watch", x: 616, y: 338, kind: "fortress" },
  { id: "sub-wyrm-rib-Hollow", name: "Clockwork Wyrm Hollow", x: 638, y: 326, kind: "skeleton" },
  { id: "sub-corsair-key", name: "Corsair's Key", x: 576, y: 472, kind: "skeleton" },
  { id: "sub-bilge-tunnel", name: "Bilge-Sluice Tunnel", x: 608, y: 468, kind: "cave" },
  { id: "sub-scale-shoal", name: "Scale-Back Atoll", x: 642, y: 458, kind: "skeleton" },
  { id: "sub-prism-sanctum", name: "Submerged Prism Dome", x: 668, y: 482, kind: "crystal" },
  { id: "sub-roundhouse-keep", name: "Roundhouse Sea-Keep", x: 752, y: 438, kind: "castle" },
  { id: "sub-reed-whispers", name: "Whispering Reed Flats", x: 682, y: 404, kind: "pass" },
  { id: "sub-coral-spire", name: "Coral-Lens Key", x: 742, y: 486, kind: "crystal" },
  { id: "sub-sky-barge-anchorage", name: "Aether-Barge Mooring", x: 782, y: 464, kind: "Floating" },
  { id: "sub-chromatic-bluffs", name: "Chromatic Bluffs", x: 806, y: 438, kind: "crystal" },
  { id: "sub-kilnwatch-keep", name: "Kilnwatch High Keep", x: 642, y: 294, kind: "castle" },
  { id: "sub-pendulum-ring", name: "Pendulum Crater Ring", x: 665, y: 236, kind: "ruins" },
  { id: "sub-gear-redoubt", name: "Gear-Lock Redoubt", x: 696, y: 266, kind: "fortress" },
  { id: "sub-prism-valley", name: "Prism-Cataract Valley", x: 722, y: 312, kind: "crystal" },
  { id: "sub-lens-woods", name: "Refracting Woods", x: 766, y: 326, kind: "pass" },
  { id: "sub-siphon-falls", name: "Siphon Cataract", x: 798, y: 334, kind: "lake" },
  { id: "sub-pinion-loch", name: "Pinion Loch", x: 764, y: 304, kind: "lake" },
  { id: "sub-inductor-gate", name: "Inductor Ridge Gate", x: 692, y: 224, kind: "fortress" },
  { id: "sub-pinion-citadel", name: "Pinion High Citadel", x: 782, y: 282, kind: "castle" },
  { id: "sub-chrono-barrows", name: "Chronometer Barrows", x: 822, y: 286, kind: "catacomb" },
  { id: "sub-rift-pylon", name: "Rift-Seal Pylon", x: 854, y: 294, kind: "obelisk" },
  { id: "sub-rusted-field", name: "Rusted Gear-Field", x: 752, y: 244, kind: "tent" },
  { id: "sub-hushed-gorge", name: "Hushed Gorge", x: 828, y: 256, kind: "pass" },
  { id: "sub-slag-barrens", name: "Slag-Waste Barrens", x: 794, y: 262, kind: "skeleton" },
  { id: "sub-caldera-keep", name: "Caldera Bastion", x: 874, y: 196, kind: "castle" },
  { id: "sub-sulfur-pools", name: "Sulfur Condenser Pools", x: 818, y: 186, kind: "lake" },
  { id: "sub-leyden-camp", name: "Leyden Outrider Camp", x: 774, y: 194, kind: "tent" },
  { id: "sub-wormway-post", name: "Wormway Vanguard Post", x: 856, y: 176, kind: "tent" },
  { id: "sub-oath-plinth", name: "Covenant Plinth", x: 924, y: 214, kind: "obelisk" },
  { id: "sub-tether-citadel", name: "Star-Tether Citadel", x: 446, y: 78, kind: "castle" },
  { id: "sub-tether-port", name: "Star-Tether Harbor", x: 392, y: 122, kind: "harbor" },
  { id: "sub-hollow-groves", name: "Hollow-Chime Woods", x: 478, y: 98, kind: "catacomb" },
  { id: "sub-tether-fen", name: "Tether-Mire Fen", x: 526, y: 84, kind: "lake" },
  { id: "sub-aurochs-ranch", name: "Highland Aurochs Ranch", x: 486, y: 58, kind: "windmill" },
  { id: "sub-halo-reliquary", name: "Halo Reliquary", x: 356, y: 96, kind: "obelisk" },
  { id: "sub-starfall-keep", name: "Starfall Bastion", x: 594, y: 106, kind: "castle" },
  { id: "sub-shattered-crypts", name: "Shattered Halo Crypts", x: 542, y: 142, kind: "catacomb" },
  { id: "sub-frost-fang-den", name: "Frost-Fang Den", x: 618, y: 138, kind: "skeleton" },
  { id: "sub-astrolabe-ruins", name: "Old Astrolabe Ruins", x: 658, y: 118, kind: "ruins" },
  { id: "sub-rime-waystation", name: "Rime-Sled Waystation", x: 696, y: 84, kind: "tent" },
  { id: "sub-glacier-maze", name: "Glacier-Prism Maze", x: 738, y: 68, kind: "crystal" },
  { id: "sub-wind-steppe", name: "Aurora Wind-Steppe", x: 642, y: 64, kind: "pass" },
  { id: "sub-aurora-shafts", name: "Aurora Aether Shafts", x: 896, y: 116, kind: "cave" },
  { id: "sub-anthracite-drift", name: "Anthracite Drift", x: 814, y: 118, kind: "cave" },
  { id: "sub-ember-crucible", name: "Trial of the First Ember", x: 162, y: 68, kind: "catacomb" },
  { id: "sub-star-heart-table", name: "Star-Heart Tableland", x: 212, y: 114, kind: "pass" },
  { id: "sub-cinder-sails-keep", name: "Cinder-Sails Haven", x: 58, y: 174, kind: "castle" },
  { id: "sub-sails-grotto", name: "Wind-Loom Grotto", x: 38, y: 162, kind: "cave" },
  { id: "sub-aether-atoll", name: "Aether-Lens Amphitheater", x: 226, y: 178, kind: "arena" },
  { id: "sub-orrery-wharf", name: "Sunken Orrery Wharf", x: 382, y: 174, kind: "harbor" },
  { id: "sub-chrono-roost", name: "Chrono-Saurian Roost", x: 338, y: 182, kind: "skeleton" },
  { id: "sub-spore-crater", name: "Spore-Weaver Crater", x: 584, y: 196, kind: "crystal" }
];

function buildTownBespokeWallPathD(cx, cy, shape, sc) {
  const s = sc || 1.15;
  const r = +(10.4 * s).toFixed(1);
  const t = (dx, dy, tr = 1.6) => `M ${+(cx + dx - tr).toFixed(1)},${+(cy + dy).toFixed(1)} a ${tr},${tr} 0 1,0 ${+(tr * 2).toFixed(1)},0 a ${tr},${tr} 0 1,0 -${+(tr * 2).toFixed(1)},0`;
  if (shape === "imperial_pentagon") {
    const ri = +(7.2 * s).toFixed(1);
    return `M ${cx},${+(cy - r).toFixed(1)} Q ${+(cx + r * 0.52).toFixed(1)},${+(cy - r * 0.72).toFixed(1)} ${+(cx + r * 0.96).toFixed(1)},${+(cy - r * 0.28).toFixed(1)} Q ${+(cx + r * 0.84).toFixed(1)},${+(cy + r * 0.34).toFixed(1)} ${+(cx + r * 0.62).toFixed(1)},${+(cy + r * 0.86).toFixed(1)} Q ${cx},${+(cy + r * 0.96).toFixed(1)} ${+(cx - r * 0.62).toFixed(1)},${+(cy + r * 0.86).toFixed(1)} Q ${+(cx - r * 0.84).toFixed(1)},${+(cy + r * 0.34).toFixed(1)} ${+(cx - r * 0.96).toFixed(1)},${+(cy - r * 0.28).toFixed(1)} Q ${+(cx - r * 0.52).toFixed(1)},${+(cy - r * 0.72).toFixed(1)} ${cx},${+(cy - r).toFixed(1)} Z M ${cx},${+(cy - ri).toFixed(1)} L ${+(cx + ri * 0.92).toFixed(1)},${+(cy - ri * 0.28).toFixed(1)} L ${+(cx + ri * 0.58).toFixed(1)},${+(cy + ri * 0.82).toFixed(1)} L ${+(cx - ri * 0.58).toFixed(1)},${+(cy + ri * 0.82).toFixed(1)} L ${+(cx - ri * 0.92).toFixed(1)},${+(cy - ri * 0.28).toFixed(1)} Z ${t(0, -r, 1.9)} ${t(r * 0.96, -r * 0.28, 1.8)} ${t(r * 0.62, r * 0.86, 1.8)} ${t(-r * 0.62, r * 0.86, 1.8)} ${t(-r * 0.96, -r * 0.28, 1.8)}`;
  }
  if (shape === "cliff_keep_harbor" || shape === "walled_harbor_pier") {
    const w = +(10.0 * s).toFixed(1);
    return `M ${+(cx - w).toFixed(1)},${+(cy - w * 0.62).toFixed(1)} Q ${cx},${+(cy - w * 0.88).toFixed(1)} ${+(cx + w * 0.86).toFixed(1)},${+(cy - w * 0.58).toFixed(1)} Q ${+(cx + w * 1.02).toFixed(1)},${cy} ${+(cx + w * 0.82).toFixed(1)},${+(cy + w * 0.42).toFixed(1)} L ${+(cx + w * 0.48).toFixed(1)},${+(cy + w * 0.98).toFixed(1)} L ${+(cx + w * 0.22).toFixed(1)},${+(cy + w * 0.98).toFixed(1)} L ${+(cx + w * 0.22).toFixed(1)},${+(cy + w * 0.38).toFixed(1)} Q ${cx},${+(cy + w * 0.28).toFixed(1)} ${+(cx - w * 0.24).toFixed(1)},${+(cy + w * 0.38).toFixed(1)} L ${+(cx - w * 0.24).toFixed(1)},${+(cy + w * 0.98).toFixed(1)} L ${+(cx - w * 0.52).toFixed(1)},${+(cy + w * 0.98).toFixed(1)} L ${+(cx - w * 0.92).toFixed(1)},${+(cy + w * 0.36).toFixed(1)} Z ${t(-w, -w * 0.62, 1.7)} ${t(w * 0.86, -w * 0.58, 1.7)}`;
  }
  if (shape === "oren_cross_bastion" || shape === "radial_moat_spire" || shape === "canal_octagon") {
    const k = +(r * 0.48).toFixed(1);
    return `M ${+(cx - k).toFixed(1)},${+(cy - r).toFixed(1)} Q ${cx},${+(cy - r * 1.08).toFixed(1)} ${+(cx + k).toFixed(1)},${+(cy - r).toFixed(1)} Q ${+(cx + r * 0.78).toFixed(1)},${+(cy - r * 0.78).toFixed(1)} ${+(cx + r).toFixed(1)},${+(cy - k).toFixed(1)} Q ${+(cx + r * 1.08).toFixed(1)},${cy} ${+(cx + r).toFixed(1)},${+(cy + k).toFixed(1)} Q ${+(cx + r * 0.78).toFixed(1)},${+(cy + r * 0.78).toFixed(1)} ${+(cx + k).toFixed(1)},${+(cy + r).toFixed(1)} Q ${cx},${+(cy + r * 1.08).toFixed(1)} ${+(cx - k).toFixed(1)},${+(cy + r).toFixed(1)} Q ${+(cx - r * 0.78).toFixed(1)},${+(cy + r * 0.78).toFixed(1)} ${+(cx - r).toFixed(1)},${+(cy + k).toFixed(1)} Q ${+(cx - r * 1.08).toFixed(1)},${cy} ${+(cx - r).toFixed(1)},${+(cy - k).toFixed(1)} Q ${+(cx - r * 0.78).toFixed(1)},${+(cy - r * 0.78).toFixed(1)} ${+(cx - k).toFixed(1)},${+(cy - r).toFixed(1)} Z ${t(-k, -r, 1.6)} ${t(k, -r, 1.6)} ${t(r, 0, 1.6)} ${t(-r, 0, 1.6)}`;
  }
  return `M ${+(cx - r * 0.82).toFixed(1)},${+(cy - r * 0.78).toFixed(1)} Q ${cx},${+(cy - r * 1.04).toFixed(1)} ${+(cx + r * 0.82).toFixed(1)},${+(cy - r * 0.78).toFixed(1)} Q ${+(cx + r * 1.14).toFixed(1)},${cy} ${+(cx + r * 0.92).toFixed(1)},${+(cy + r * 0.78).toFixed(1)} Q ${cx},${+(cy + r * 0.98).toFixed(1)} ${+(cx - r * 0.92).toFixed(1)},${+(cy + r * 0.78).toFixed(1)} Q ${+(cx - r * 1.14).toFixed(1)},${cy} ${+(cx - r * 0.82).toFixed(1)},${+(cy - r * 0.78).toFixed(1)} Z ${t(-r * 0.82, -r * 0.78, 1.6)} ${t(r * 0.82, -r * 0.78, 1.6)} ${t(r * 0.92, r * 0.78, 1.6)} ${t(-r * 0.92, r * 0.78, 1.6)}`;
}

function computeIrregularZonePolygonPoints(fx, fy, idx, isFort, fz) {
  const zid = (fz && fz.zone_id) || "";
  const spec = ATLAS_MOB_FARM_SUB_STRUCTURES[zid];
  const zoneScale = spec && spec.scale ? spec.scale : (0.82 + (idx % 5) * 0.18);
  const baseR = (isFort ? 10.6 : 9.6) * zoneScale;
  const stretchX = spec && spec.sx ? spec.sx : (0.85 + ((idx * 7) % 5) * 0.12);
  const stretchY = spec && spec.sy ? spec.sy : (0.80 + ((idx * 11) % 5) * 0.11);
  const rot = ((idx * 37) % 180) * (Math.PI / 180);
  const nVerts = isFort ? 6 : (6 + (idx % 3));
  const pts = [];
  for (let k = 0; k < nVerts; k++) {
    const ang = (k / nVerts) * Math.PI * 2 + rot;
    const jitter = 0.78 + (((idx * 13 + k * 19) % 9) * 0.052);
    const rx = baseR * stretchX * jitter;
    const ry = baseR * stretchY * jitter;
    const px = +(fx + Math.cos(ang) * rx).toFixed(1);
    const py = +(fy + Math.sin(ang) * ry).toFixed(1);
    pts.push(`${px},${py}`);
  }
  return pts;
}

function buildMobFarmSubStructurePathD(fx, fy, kind) {
  const x = +fx.toFixed(1), y = +fy.toFixed(1);
  if (kind === "village" || kind === "beast_farm" || kind === "windmill") {
    return `M ${x-2.4},${y+3.6} C ${x-2.1},${y+0.8} ${x-1.7},${y-1.6} ${x-1.4},${y-2.4} L ${x+1.4},${y-2.4} C ${x+1.7},${y-1.6} ${x+2.1},${y+0.8} ${x+2.4},${y+3.6} Z M ${x-4.6},${y-4.6} L ${x+4.6},${y+2.6} M ${x+4.6},${y-4.6} L ${x-4.6},${y+2.6} M ${x+2.4},${y+3.6} v -2.6 l 1.9,-1.5 l 2.1,1.5 v 2.6 Z`;
  }
  if (kind === "outpost" || kind === "tent") {
    return `M ${x-4.4},${y+3.4} Q ${x-2.8},${y-0.4} ${x-1.6},${y-2.8} Q ${x-0.4},${y-0.4} ${x+1.2},${y+3.4} Z M ${x+0.4},${y+3.4} Q ${x+1.8},${y+0.2} ${x+2.8},${y-2.2} Q ${x+3.8},${y+0.2} ${x+5.0},${y+3.4} Z M ${x-4.6},${y-3.6} h 3.8 M ${x-3.8},${y-3.6} v 6.4`;
  }
  if (kind === "stronghold" || kind === "fortress" || kind === "castle") {
    return `M ${x-5.8},${y+3.4} L ${x-5.4},${y-1.8} L ${x-4.2},${y-4.2} L ${x-3.0},${y-1.8} Q ${x-2.2},${y-1.4} ${x-1.8},${y-1.8} L ${x-1.6},${y-4.4} L ${x},${y-6.6} L ${x+1.6},${y-4.4} L ${x+1.8},${y-1.8} Q ${x+2.2},${y-1.4} ${x+3.0},${y-1.8} L ${x+4.2},${y-4.2} L ${x+5.4},${y-1.8} L ${x+5.8},${y+3.4} Q ${x},${y+4.4} ${x-5.8},${y+3.4} Z M ${x-1.3},${y+3.6} v -2.6 a 1.3,1.3 0 0,1 2.6,0 v 2.6 Z`;
  }
  if (kind === "cave" || kind === "skeleton") {
    return `M ${x-5.0},${y+2.4} Q ${x-2.5},${y-4.2} ${x},${y+1.8} Q ${x+2.5},${y-4.2} ${x+5.0},${y+2.4} M ${x-3.4},${y+3.4} Q ${x},${y-2.6} ${x+3.4},${y+3.4} M ${x-5.6},${y+1.2} l 2.4,-2.6 l 1.8,2.2 Z`;
  }
  if (kind === "tower" || kind === "obelisk" || kind === "crystal" || kind === "school") {
    return `M ${x-3.0},${y+3.6} L ${x-1.7},${y-1.4} L ${x},${y-6.2} L ${x+1.7},${y-1.4} L ${x+3.0},${y+3.6} Q ${x},${y+4.2} ${x-3.0},${y+3.6} Z M ${x-4.6},${y+3.4} L ${x-3.1},${y-0.6} L ${x-1.8},${y+3.4} Z M ${x+1.8},${y+3.4} L ${x+3.1},${y-0.6} L ${x+4.6},${y+3.4} Z`;
  }
  if (kind === "arena") {
    return `M ${x-4.6},${y+1.2} Q ${x},${y-2.8} ${x+4.6},${y+1.2} Q ${x},${y+4.4} ${x-4.6},${y+1.2} Z M ${x-3.6},${y-3.4} L ${x+3.6},${y+3.4} M ${x+3.6},${y-3.4} L ${x-3.6},${y+3.4}`;
  }
  return `M ${x-4.8},${y+3.6} Q ${x},${y+4.2} ${x+4.8},${y+3.6} L ${x+4.2},${y+1.2} L ${x+2.8},${y+1.2} L ${x+2.2},${y-1.2} L ${x-2.2},${y-1.2} L ${x-2.8},${y+1.2} L ${x-4.2},${y+1.2} Z M ${x-3.4},${y-2.4} Q ${x},${y-4.8} ${x+3.4},${y-2.4} Q ${x},${y-0.4} ${x-3.4},${y-2.4} Z`;
}

function renderOverlandInlineMicroBlueprintsSvg(overlandLandmarks, zoomLevel) {
  const showRegionalDetail = zoomLevel >= 1.35;
  const showStreetLabels = zoomLevel >= 2.2;
  const sp = (typeof DATA !== "undefined" && DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const allZones = typeof getAllAtlas63Zones === "function" ? getAllAtlas63Zones(tatlas) : [];
  const placedById = (typeof getAtlasPlacedZonePoints === "function" && allZones.length)
    ? getAtlasPlacedZonePoints(tatlas, allZones)
    : {};
  const cSub = (cx, cy, r) => `M ${+(cx - r).toFixed(1)},${+cy.toFixed(1)} a ${r},${r} 0 1,0 ${+(r * 2).toFixed(1)},0 a ${r},${r} 0 1,0 -${+(r * 2).toFixed(1)},0`;

  const fieldZones = allZones.filter(z => z.actionType === "field" || z.actionType === "fortress");
  const townZones = allZones.filter(z => z.actionType === "town");
  const dungeonZones = allZones.filter(z => z.actionType === "dungeon");
  const coreLandmarkIds = new Set(["zone-town-lantern-hollow","zone-town-porcelain-loom","zone-town-draft-kiln-post","zone-town-root-train-roundhouse","zone-town-carillon-belfry","zone-town-cinnamon-mill","zone-town-kilnwatch-bastion","zone-town-pinion-terminus","zone-town-starfall-haven","zone-town-crown-beacon","zone-dungeon-kiln-cellar","zone-dungeon-pendulum-shaft","zone-dungeon-chronometer-foundry"]);

  const getCalibratedZoneRaidLevel = (fz, spec) => {
    if (!spec || !Array.isArray(spec.raids) || spec.raids.length === 0) return null;
    const [minLv, maxLv] = typeof parseAtlasZoneLevelRange === "function" ? parseAtlasZoneLevelRange(fz) : [1, 20];
    const rawLv = spec.raids[0];
    return Math.max(minLv, Math.min(maxLv, rawLv));
  };

  const cleanAtlasZoneName = (z, spec) => {
    const raw = String((z && z.name) || "").split(" (")[0];
    if (raw) return raw;
    return (spec && spec.label) || "Frontier Zone";
  };

  // MACRO COMPACT PATHS AT < 1.35x (Semantic LOD: show major Towns, Fortresses & Castles clearly; hide tiny hunting-ground text smudges!)
  if (!showRegionalDetail) {
    const structOutpostD = [];
    const structKeepCaveD = [];
    const dngZigguratD = [];
    const companionIconD = [];
    const redFlagsD = [];
    const raidCircleD = [];
    const raidTspans = [];
    const zoneLabelTspans = [];
    const extraTownMiniD = [];
    const extraTownTspans = [];

    const macroLabelBoxes = [];
    const canPlaceMacroLabel = (cx, cy, textStr, fontSize) => {
      const hw = Math.max(14, textStr.length * fontSize * 0.31 + 4.0);
      const hh = fontSize * 0.75 + 2.2;
      const box = { x1: cx - hw, y1: cy - hh, x2: cx + hw, y2: cy + hh * 0.5 };
      for (let i = 0; i < macroLabelBoxes.length; i++) {
        const b = macroLabelBoxes[i];
        if (!(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2)) return false;
      }
      macroLabelBoxes.push(box);
      return true;
    };

    (overlandLandmarks || []).forEach(lm => {
      const title = String(lm.label || "").split(" (")[0];
      canPlaceMacroLabel(lm.x, lm.y + 15, title, 8.5);
    });

    townZones.forEach(tz => {
      if (coreLandmarkIds.has(tz.zone_id)) return;
      const pt = placedById[tz.zone_id];
      if (!pt) return;
      extraTownMiniD.push(buildMobFarmSubStructurePathD(pt.x, pt.y, "castle"));
      const sName = String(tz.name || "").split(" (")[0];
      const ly = +(pt.y + 8.8).toFixed(1);
      if (canPlaceMacroLabel(pt.x, ly, sName, 4.4)) {
        extraTownTspans.push(`<tspan x="${pt.x}" y="${ly}">${escapeHtml(sName)}</tspan>`);
      }
    });

    fieldZones.forEach((fz) => {
      const pt = placedById[fz.zone_id];
      if (!pt) return;
      const isFort = fz.actionType === "fortress";
      const spec = ATLAS_MOB_FARM_SUB_STRUCTURES[fz.zone_id] || { kind: "outpost", raids: [] };
      const sD = buildMobFarmSubStructurePathD(pt.x, pt.y, spec.kind);
      if (["outpost", "village", "beast_farm"].includes(spec.kind)) structOutpostD.push(sD);
      else structKeepCaveD.push(sD);

      if (isFort) {
        redFlagsD.push(`M ${pt.x},${pt.y - 4.2} v -5.4 l 4.6,1.8 l -4.6,1.8 Z`);
        const fName = cleanAtlasZoneName(fz, spec);
        const ly = +(pt.y + 8.0).toFixed(1);
        if (canPlaceMacroLabel(pt.x, ly, fName, 3.8)) {
          zoneLabelTspans.push(`<tspan x="${pt.x}" y="${ly}">${escapeHtml(fName)}</tspan>`);
        }
      }

      const raidLv = getCalibratedZoneRaidLevel(fz, spec);
      if (raidLv !== null && isFort) {
        const rx = +(pt.x + 6.8).toFixed(1);
        const ry = +(pt.y - 5.2).toFixed(1);
        raidCircleD.push(cSub(rx, ry, 2.8));
        raidTspans.push(`<tspan x="${rx}" y="${+(ry + 1.0).toFixed(1)}">${raidLv}</tspan>`);
      }
    });

    dungeonZones.forEach(dz => {
      if (coreLandmarkIds.has(dz.zone_id)) return;
      const pt = placedById[dz.zone_id];
      if (!pt) return;
      dngZigguratD.push(buildMobFarmSubStructurePathD(pt.x, pt.y, "sepulcher"));
    });

    ATLAS_COMPANION_SUB_LANDMARKS.forEach(sub => {
      if (sub.kind === "castle" || sub.kind === "fortress" || sub.kind === "harbor" || sub.kind === "arena") {
        companionIconD.push(buildMobFarmSubStructurePathD(sub.x, sub.y, sub.kind));
      }
      if (sub.kind === "fortress") {
        redFlagsD.push(`M ${sub.x},${sub.y - 4.0} v -5.2 l 4.4,1.7 l -4.4,1.7 Z`);
      }
      if (sub.kind === "castle" || sub.kind === "harbor") {
        const ly = +(sub.y + 7.4).toFixed(1);
        if (canPlaceMacroLabel(sub.x, ly, sub.name, 3.6)) {
          zoneLabelTspans.push(`<tspan x="${sub.x}" y="${ly}">${escapeHtml(sub.name)}</tspan>`);
        }
      }
    });

    return `<g id="atlasOverlandInlineMicroBlueprints" data-irregular-territory="1" data-l2hub-raid-badges="1" data-mob-farm-compound="1" pointer-events="none">
      <path id="atlasTownBespokeFootprintsMacro" d="${extraTownMiniD.join(" ")}" fill="#8c6d3b" stroke="#18120a" stroke-width="0.65" stroke-linejoin="round"/>
      <path id="atlasMobFarmOutpostsMacro" d="${structOutpostD.join(" ")}" fill="#7c5d32" stroke="#18120a" stroke-width="0.6" stroke-linejoin="round"/>
      <path id="atlasMobFarmStrongholdsMacro" d="${structKeepCaveD.join(" ")}" fill="#8a6b3a" stroke="#18120a" stroke-width="0.65" stroke-linejoin="round"/>
      <path id="atlasCatacombZigguratsMacro" d="${dngZigguratD.join(" ")}" fill="#2b2318" stroke="#c8b692" stroke-width="0.55" stroke-linejoin="round"/>
      <path id="atlasCompanionSubLandmarksMacro" d="${companionIconD.join(" ")}" fill="#785c34" stroke="#18120a" stroke-width="0.58" stroke-linejoin="round"/>
      <path id="atlasFortressRedPennantsMacro" d="${redFlagsD.join(" ")}" fill="#a63a2b" stroke="#18120a" stroke-width="0.45" stroke-linejoin="round"/>
      <text font-size="3.8" font-weight="700" font-family="Georgia, serif" fill="#f5efe0" text-anchor="middle" style="paint-order:stroke fill;stroke:#120d07;stroke-width:1.25px">${zoneLabelTspans.join("")}</text>
      <text font-size="4.4" font-weight="800" font-family="Georgia, serif" fill="#fffbeb" text-anchor="middle" style="paint-order:stroke fill;stroke:#0c0905;stroke-width:1.45px">${extraTownTspans.join("")}</text>
      <path id="atlasL2HubRaidLevelCirclesMacro" d="${raidCircleD.join(" ")}" fill="#1e3a5f" stroke="#d4af37" stroke-width="0.65"/>
      <text font-size="3.0" font-weight="800" font-family="sans-serif" fill="#f8fafc" text-anchor="middle">${raidTspans.join("")}</text>
    </g>`;
  }

  // DETAILED REGIONAL & TACTICAL VIEW (>= 1.35x Zoom)
  const regLabelBoxes = [];
  const canPlaceRegLabel = (cx, cy, textStr, fontSize) => {
    const hw = Math.max(10, textStr.length * fontSize * 0.28 + 2.0);
    const hh = fontSize * 0.65 + 1.2;
    const box = { x1: cx - hw, y1: cy - hh, x2: cx + hw, y2: cy + hh * 0.45 };
    for (let i = 0; i < regLabelBoxes.length; i++) {
      const b = regLabelBoxes[i];
      if (!(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2)) return false;
    }
    regLabelBoxes.push(box);
    return true;
  };
  (overlandLandmarks || []).forEach(lm => {
    const title = String(lm.label || "").split(" (")[0];
    canPlaceRegLabel(lm.x, lm.y + 11, title, 6.2);
  });

  const itemsSvg = (overlandLandmarks || []).map(lm => {
    const cx = lm.x;
    const cy = lm.y;
    if (lm.dungeonWarpId) {
      return `<g opacity="0.92" pointer-events="none"><circle cx="${cx}" cy="${cy}" r="5.5" fill="rgba(28,22,14,0.45)" stroke="#b8a682" stroke-width="0.6"/></g>`;
    }
    const tSpec = ATLAS_TOWN_FOOTPRINT_SPECS[lm.id] || { scale: lm.kind === "castle" ? 1.65 : 1.15, shape: "trapezoid_fort" };
    const sc = tSpec.scale;
    const off = +(4.2 * sc).toFixed(1);
    const wallRingD = buildTownBespokeWallPathD(cx, cy, tSpec.shape, sc * 0.72);
    const shopLabels = showStreetLabels ? `
      <text x="${+(cx - off).toFixed(1)}" y="${+(cy - off).toFixed(1)}" text-anchor="middle" fill="#f5efe0" font-size="1.45" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#120d07;stroke-width:0.45px">#1 Wpn</text>
      <text x="${+(cx + off).toFixed(1)}" y="${+(cy - off).toFixed(1)}" text-anchor="middle" fill="#f5efe0" font-size="1.45" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#120d07;stroke-width:0.45px">#2 Arm</text>
      <text x="${cx}" y="${+(cy - off * 1.35).toFixed(1)}" text-anchor="middle" fill="#fde68a" font-size="1.45" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#120d07;stroke-width:0.45px">#3 GK</text>
      <text x="${+(cx - off).toFixed(1)}" y="${+(cy + off * 0.85).toFixed(1)}" text-anchor="middle" fill="#f5efe0" font-size="1.45" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#120d07;stroke-width:0.45px">#4 Vlt</text>
      <text x="${+(cx + off).toFixed(1)}" y="${+(cy + off * 0.85).toFixed(1)}" text-anchor="middle" fill="#f5efe0" font-size="1.45" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#120d07;stroke-width:0.45px">#5 Frg</text>
    ` : "";
    return `<g opacity="0.96" pointer-events="none" data-town-archetype="${escapeHtml(tSpec.shape)}" data-town-scale="${sc}">
      <path d="${wallRingD}" fill="rgba(58,46,28,0.28)" stroke="#241a0e" stroke-width="0.65" stroke-linejoin="round"/>
      ${shopLabels}
    </g>`;
  }).join("");

  const extraHubTownsSvg = townZones.filter(tz => !coreLandmarkIds.has(tz.zone_id)).map(tz => {
    const pt = placedById[tz.zone_id];
    if (!pt) return "";
    const shortName = (tz.name || "").split(" (")[0];
    const x = pt.x, y = pt.y;
    const isoCityD = buildMobFarmSubStructurePathD(x, y, "castle");
    return `<g opacity="0.96" pointer-events="none" data-extra-hub-town="${escapeHtml(tz.zone_id)}">
      <ellipse cx="${x}" cy="${y + 3.2}" rx="7.2" ry="3.2" fill="rgba(18,13,7,0.52)"/>
      <path d="${isoCityD}" fill="#8f713f" stroke="#161008" stroke-width="0.7" stroke-linejoin="round"/>
      ${canPlaceRegLabel(x, +(y + 8.8).toFixed(1), shortName, 3.3) ? `<text x="${x}" y="${+(y + 8.8).toFixed(1)}" text-anchor="middle" fill="#fffbeb" font-size="3.3" font-weight="800" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#0c0905;stroke-width:1.1px">${escapeHtml(shortName)}</text>` : ""}
    </g>`;
  }).join("");

  const extraDungeonsSvg = dungeonZones.filter(dz => !coreLandmarkIds.has(dz.zone_id)).map(dz => {
    const pt = placedById[dz.zone_id];
    if (!pt) return "";
    const x = pt.x, y = pt.y;
    const dName = String(dz.name || "").split(" (")[0];
    const zigD = buildMobFarmSubStructurePathD(x, y, "sepulcher");
    return `<g opacity="0.96" pointer-events="none">
      <path d="${zigD}" fill="#261f16" stroke="#c8b692" stroke-width="0.6" stroke-linejoin="round"/>
      <circle cx="${x}" cy="${y - 2.4}" r="0.9" fill="#d4af37"/>
      ${canPlaceRegLabel(x, +(y + 7.8).toFixed(1), dName, 2.75) ? `<text x="${x}" y="${+(y + 7.8).toFixed(1)}" text-anchor="middle" fill="#f5efe0" font-size="2.75" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#120d07;stroke-width:0.95px">${escapeHtml(dName)}</text>` : ""}
    </g>`;
  }).join("");

  const companionDetailedSvg = ATLAS_COMPANION_SUB_LANDMARKS.map(sub => {
    const x = sub.x, y = sub.y;
    const isPassOrLake = sub.kind === "pass" || sub.kind === "lake";
    const iconD = isPassOrLake ? "" : buildMobFarmSubStructurePathD(x, y, sub.kind);
    const flagSvg = sub.kind === "fortress"
      ? `<path d="M ${x},${y - 4.0} v -5.6 l 4.8,1.8 l -4.8,1.8 Z" fill="#a63a2b" stroke="#18120a" stroke-width="0.45"/>`
      : "";
    const fillCol = sub.kind === "catacomb" ? "#261f16" : (sub.kind === "crystal" ? "#7b9094" : "#856738");
    const strokeCol = sub.kind === "catacomb" ? "#c8b692" : "#18120a";
    return `<g opacity="0.95" pointer-events="none" data-companion-landmark="${escapeHtml(sub.id)}">
      ${iconD ? `<path d="${iconD}" fill="${fillCol}" stroke="${strokeCol}" stroke-width="0.6" stroke-linejoin="round"/>` : ""}
      ${flagSvg}
      ${canPlaceRegLabel(x, +(y + (isPassOrLake ? 1.2 : 7.2)).toFixed(1), sub.name, isPassOrLake ? 2.4 : 2.65) ? `<text x="${x}" y="${+(y + (isPassOrLake ? 1.2 : 7.2)).toFixed(1)}" text-anchor="middle" fill="${isPassOrLake ? '#dfd3b4' : '#f5efe0'}" font-size="${isPassOrLake ? '2.4' : '2.65'}" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#120d07;stroke-width:0.9px">${escapeHtml(sub.name)}</text>` : ""}
    </g>`;
  }).join("");

  const fieldMicroSvg = fieldZones.map((fz) => {
    const pt = placedById[fz.zone_id];
    if (!pt) return "";
    const fx = pt.x;
    const fy = pt.y;
    const isFort = fz.actionType === "fortress";
    const [minLv, maxLv] = typeof parseAtlasZoneLevelRange === "function" ? parseAtlasZoneLevelRange(fz) : [1, 20];
    const spec = ATLAS_MOB_FARM_SUB_STRUCTURES[fz.zone_id] || { kind: "outpost", scale: 1.0, tag: "Outpost", label: "Frontier Outpost", raids: [], buildings: ["#1 Main Tent", "#2 Barracks", "#3 Watchtower", "#4 Supply"] };

    const structPathD = buildMobFarmSubStructurePathD(fx, fy, spec.kind);
    const bldgs = Array.isArray(spec.buildings) && spec.buildings.length >= 4
      ? spec.buildings
      : ["#1 Command", "#2 Barracks", "#3 Watchtower", "#4 Depot"];

    const compoundBldgLabelsSvg = showStreetLabels ? `
      <text x="${+(fx - 3.6).toFixed(1)}" y="${+(fy - 4.2).toFixed(1)}" text-anchor="middle" fill="#fde68a" font-size="1.2" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#120d07;stroke-width:0.45px">${escapeHtml(bldgs[0])}</text>
      <text x="${+(fx + 3.6).toFixed(1)}" y="${+(fy - 4.2).toFixed(1)}" text-anchor="middle" fill="#fde68a" font-size="1.2" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#120d07;stroke-width:0.45px">${escapeHtml(bldgs[1])}</text>
      <text x="${+(fx - 3.6).toFixed(1)}" y="${+(fy + 5.2).toFixed(1)}" text-anchor="middle" fill="#f5efe0" font-size="1.2" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#120d07;stroke-width:0.45px">${escapeHtml(bldgs[2])}</text>
      <text x="${+(fx + 3.6).toFixed(1)}" y="${+(fy + 5.2).toFixed(1)}" text-anchor="middle" fill="#f5efe0" font-size="1.2" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#120d07;stroke-width:0.45px">${escapeHtml(bldgs[3])}</text>
    ` : "";

    const fortFlagSvg = isFort ? `
      <line x1="${fx}" y1="${fy - 3.8}" x2="${fx}" y2="${fy - 9.8}" stroke="#120d07" stroke-width="0.75"/>
      <polygon points="${fx},${fy - 9.8} ${fx + 5.0},${fy - 7.8} ${fx},${fy - 5.8}" fill="#a63a2b" stroke="#f5efe0" stroke-width="0.4"/>
    ` : "";

    const raidLv = getCalibratedZoneRaidLevel(fz, spec);
    const raidBadgeSvg = raidLv !== null ? (() => {
      const rx = +(fx + 6.4).toFixed(1);
      const ry = +(fy - 4.8).toFixed(1);
      return `<g data-l2hub-raid-level="${raidLv}" data-zone-level-band="${minLv}-${maxLv}">
        <circle cx="${rx}" cy="${ry}" r="2.0" fill="#1e3a5f" stroke="#d4af37" stroke-width="0.45"/>
        <text x="${rx}" y="${+(ry + 0.75).toFixed(1)}" text-anchor="middle" fill="#ffffff" font-size="1.6" font-weight="800" font-family="sans-serif">${raidLv}</text>
      </g>`;
    })() : "";

    const cleanName = cleanAtlasZoneName(fz, spec);
    const structTagLbl = canPlaceRegLabel(fx, +(fy + 7.4).toFixed(1), cleanName, 2.8) ? `<text x="${fx}" y="${+(fy + 7.4).toFixed(1)}" text-anchor="middle" fill="#f5efe0" font-size="2.8" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#120d07;stroke-width:0.95px">${escapeHtml(cleanName)}</text>` : "";

    return `<g opacity="0.96" pointer-events="none" data-mob-farm-kind="${spec.kind}" data-mob-farm-scale="${spec.scale || 1.0}" data-mob-farm-compound="1" data-compound-buildings="4">
      <ellipse cx="${fx}" cy="${fy + 2.8}" rx="5.6" ry="2.2" fill="rgba(18,13,7,0.46)"/>
      <path d="${structPathD}" fill="#856738" stroke="#18120a" stroke-width="0.65" stroke-linejoin="round"/>
      ${fortFlagSvg}
      ${compoundBldgLabelsSvg}
      ${raidBadgeSvg}
      ${structTagLbl}
    </g>`;
  }).join("");

  return `<g id="atlasOverlandInlineMicroBlueprints" data-irregular-territory="1" data-l2hub-raid-badges="1" data-mob-farm-compound="1">${companionDetailedSvg}${fieldMicroSvg}${extraDungeonsSvg}${extraHubTownsSvg}${itemsSvg}</g>`;
}
