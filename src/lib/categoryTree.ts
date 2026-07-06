export interface CategoryNode {
  name: string;
  children?: CategoryNode[];
}

export const CATEGORY_TREE: CategoryNode[] = [
  { name: "Babyausstattung", children: [
    { name: "Baby Geschenke", children: [
      { name: "Beißringe & Rasseln" }, { name: "Kuscheltiere & Schmusetücher" },
      { name: "Mobile & Spieluhren" }, { name: "Spielbögen & Spielmatten" },
    ]},
    { name: "Babypflege", children: [
      { name: "Bademäntel/Kapuzenhandtücher/Waschlappen" }, { name: "Baden & Pflegen" },
      { name: "Lätzchen" }, { name: "Schnuller" }, { name: "Stoffwindeln" }, { name: "Wickeln" },
    ]},
    { name: "Babys erste Kleidung", children: [
      { name: "Babyhosen" }, { name: "Bio-Basics" }, { name: "Bio-Wollfleece" },
      { name: "Bodies" }, { name: "Jäckchen & Pullis" }, { name: "Mützchen & Fäustlinge" },
      { name: "Pyjamas & Overalls" }, { name: "T-Shirts & Tops" },
    ]},
    { name: "Babytragen" },
    { name: "Babyzimmer", children: [
      { name: "Babybetten" }, { name: "Babynestchen" }, { name: "Babyschlafsäcke" },
      { name: "Babywippen & Hochstühle" }, { name: "Betthimmel" },
      { name: "Mobile & Spieluhren" }, { name: "Wickelkommoden" },
      { name: "Wiegen & Beistellbettchen" },
    ]},
    { name: "Für Mamas", children: [
      { name: "Babytragen" }, { name: "Deko" }, { name: "Gutscheine" },
      { name: "Schwangerschaft & Stillen" }, { name: "Wickeltaschen- & Rucksäcke" },
    ]},
  ]},
  { name: "Back to School", children: [
    { name: "Buchstaben Spaß" }, { name: "Kinderschreibtische & Stühle" },
    { name: "Lederhausschuhe" }, { name: "Regen- & Outdoorkleidung" },
    { name: "Rucksäcke & Turnbeutel" }, { name: "Trinkflaschen & Jausenboxen" },
  ]},
  { name: "Bio-Basics & Wollfleece", children: [
    { name: "Basics 0 bis 4 J" }, { name: "Frühchen" }, { name: "Für Mamas" }, { name: "Wollfleece" },
  ]},
  { name: "Bücher & Tonies", children: [
    { name: "Kinderbücher" }, { name: "Ratgeber" }, { name: "Tonies" },
  ]},
  { name: "Gutscheine", children: [
    { name: "Gutschein selbst ausdrucken" }, { name: "Postversand" },
  ]},
  { name: "Home & Deko", children: [
    { name: "Fürs Badezimmer", children: [
      { name: "Bademäntel & Handtücher" }, { name: "Klein Aufbewahrung" }, { name: "Wickeln & Pflegen" },
    ]},
    { name: "Kindergeschirr", children: [
      { name: "Geschirrsets" }, { name: "Jausenboxen" }, { name: "Kinderbesteck" },
      { name: "Lätzchen" }, { name: "Teller & Tassen" }, { name: "Trinkflaschen" },
    ]},
    { name: "Kinderzimmer Deko", children: [
      { name: "Aufbewahrung" }, { name: "Betthimmel" }, { name: "Dekokissen" },
      { name: "Lampen & Nachtlichter" }, { name: "Mobile & Spieluhren" },
      { name: "Sessel & Sofas" }, { name: "Spielmatten & Krabbeldecken" },
      { name: "Teppiche" }, { name: "Tipis & Matten" },
    ]},
    { name: "Papeterie" },
    { name: "Rund ums Schlafen", children: [
      { name: "Babydecken" }, { name: "Babynestchen" }, { name: "Babyschlafsäcke" }, { name: "Bettwäsche" },
    ]},
    { name: "Wanddeko", children: [
      { name: "Girlanden" }, { name: "Lichterketten" },
      { name: "Wandfarbe/Lack/Tapete" }, { name: "Wandregale & Deko" },
    ]},
  ]},
  { name: "Kinderwagen", children: [
    { name: "BUGABOO", children: [
      { name: "Butterfly 2" }, { name: "Donkey 5" }, { name: "Dragonfly" },
      { name: "Fox 5" }, { name: "Fox 5 Renew" }, { name: "Zubehör" },
    ]},
    { name: "CYBEX", children: [
      { name: "Autositze" }, { name: "Coya" }, { name: "Gazelle S" },
      { name: "Priam" }, { name: "Zubehör" }, { name: "e-Gazelle S" }, { name: "e-Priam" },
    ]},
    { name: "JOOLZ", children: [
      { name: "Aer 2" }, { name: "Day 5" }, { name: "Geo 3" }, { name: "Hub 2" }, { name: "Zubehör" },
    ]},
    { name: "Kinderautositze", children: [
      { name: "CYBEX" }, { name: "DOONA" }, { name: "MAXI COSI" }, { name: "THULE" },
    ]},
    { name: "MAXI COSI", children: [{ name: "Autositze" }, { name: "Fame" }] },
    { name: "NATURKIND", children: [
      { name: "Ida" }, { name: "Lars" }, { name: "Lux Evo" }, { name: "Mads" }, { name: "Zubehör" },
    ]},
    { name: "STOKKE", children: [{ name: "YOYO³" }, { name: "Zubehör" }] },
    { name: "THULE", children: [
      { name: "Autositze" }, { name: "Spring 2" }, { name: "Urban Glide 3" },
    ]},
    { name: "Zubehör", children: [
      { name: "Fuß- & Fellsäcke" }, { name: "Matratzen" },
      { name: "Sitzauflagen" }, { name: "Wickeltaschen" },
    ]},
  ]},
  { name: "Mode", children: [
    { name: "Bademode & UV-Schutz", children: [
      { name: "Badehosen- & anzüge" }, { name: "Bademäntel" }, { name: "Badeschuhe" },
      { name: "Badewindeln" }, { name: "Schwimmlernwesten" }, { name: "Sonnenbrillen" },
      { name: "Sonnenhüte- & kappen" }, { name: "UV-Schutz T-Shirts" },
    ]},
    { name: "Kindermode 0 bis 5J", children: [
      { name: "Bio-Basics" }, { name: "Bodies" }, { name: "Hauben & Fäustlinge" },
      { name: "Hosen & Leggings" }, { name: "Jäckchen & Pullover" },
      { name: "Kleidchen & Röcke" }, { name: "Pyjamas/Overalls/Strampler" },
      { name: "Shorts & Babyhöschen" }, { name: "Socken & Strümpfe" },
      { name: "T-Shirts & Tops" }, { name: "Wolle" },
    ]},
    { name: "Outdoormode bis 6J", children: [
      { name: "Bio-Wollfleece" }, { name: "Krabbelsocken & Lederpatschen" },
      { name: "Mützen/Handschuhe/Schals" }, { name: "Schneeoveralls & Outdoorhosen" },
      { name: "Winterjacken" }, { name: "Übergang & Regen" },
    ]},
    { name: "Rucksäcke & Taschen", children: [
      { name: "Kinderkoffer" }, { name: "Kinderrucksäcke" },
      { name: "Turnbeutel" }, { name: "Täschchen" },
    ]},
    { name: "Schuhe", children: [
      { name: "Babyschuhe" }, { name: "Lederhausschuhe" }, { name: "Sandalen" }, { name: "Stiefel" },
    ]},
  ]},
  { name: "Möbel", children: [
    { name: "Babyzimmer", children: [
      { name: "Babybetten" }, { name: "Babywippen & Hochstühle" }, { name: "Betthimmel" },
      { name: "Mobile & Spieluhren" }, { name: "Nestchen" },
      { name: "Wickelkissen & Auflagen" }, { name: "Wickelkommoden" },
      { name: "Wiegen & Beistellbettchen" },
    ]},
    { name: "Hochstühle" },
    { name: "Kinderzimmer", children: [
      { name: "Betten" }, { name: "Kindertische & Stühle" },
      { name: "Klettern/Rutschen/Schaukeln" }, { name: "Kommoden & Wickeltische" },
      { name: "Matratzen" }, { name: "Möbelzubehör" }, { name: "Regale" },
      { name: "Schreibtische" }, { name: "Schränke" }, { name: "Sessel & Sofas" },
      { name: "Spielhäuser & Tipis" },
    ]},
    { name: "Rund ums Schlafen", children: [
      { name: "Babyschlafsäcke" }, { name: "Bettwäsche" }, { name: "Decken" }, { name: "Nestchen" },
    ]},
    { name: "Wandfarbe, Lack & Tapete", children: [
      { name: "Lack auf Wasserbasis" }, { name: "Tapeten & Wandsticker" }, { name: "Wandfarbe Dispersion" },
    ]},
    { name: "Zimmer Deko", children: [
      { name: "Aufbewahrung" }, { name: "Betthimmel" }, { name: "Dekokissen" },
      { name: "Krabbeldecken" }, { name: "Lampen & Nachtlichter" }, { name: "Teppiche" },
    ]},
  ]},
  { name: "Spielen", children: [
    { name: "Baby Spielsachen", children: [
      { name: "Badespielzeug" }, { name: "Beißringe & Rasseln" }, { name: "Schmusetücher" },
      { name: "Spielbögen & Spielmatten" }, { name: "Spieluhren & Mobile" },
      { name: "Wagen- & Schnullerketten" },
    ]},
    { name: "Bücher", children: [
      { name: "Bilderbücher" }, { name: "Kinderbücher" }, { name: "Liederbücher" },
      { name: "Mal- und Bastelbücher" }, { name: "Ratgeber" }, { name: "Sachbücher" },
    ]},
    { name: "Kinderspielzeug", children: [
      { name: "Autos & Co" }, { name: "Holzeisenbahn" }, { name: "Holzspielzeug" },
      { name: "Klettern/Rutschen/Schaukeln" }, { name: "Kugelbahnen" },
      { name: "Küche & Kaufladen" }, { name: "Laufräder & Scooter" },
      { name: "Malen & Basteln" }, { name: "Musikinstrumente" },
      { name: "Puppenwelt & Puppenhäuser" }, { name: "Spiele & Puzzles" },
      { name: "Stofftiere" }, { name: "Tipis & Spielhäuser" },
      { name: "Toniebox & Hörgeschichten" },
    ]},
    { name: "Spielen nach Thema", children: [
      { name: "Für unterwegs" }, { name: "Kreativ" }, { name: "Laufenlernhilfe" },
      { name: "Lernspiele" }, { name: "Rollenspiele" },
    ]},
  ]},
];
