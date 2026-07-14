export interface CategoryNode {
  name: string;
  children?: CategoryNode[];
}

export const CATEGORY_TREE: CategoryNode[] = [
  { name: "Aktionen", children: [
    { name: "Aktuelle Promotions" },
    { name: "alle", children: [
      { name: "Auffüllen Saison" }
    ]},
    { name: "Aussteller" },
    { name: "Valentin" }
  ]},
  { name: "Babyausstattung", children: [
    { name: "Baby Geschenke", children: [
      { name: "Beißringe & Rasseln" },
      { name: "Kuscheltiere & Schmusetücher" },
      { name: "Mobile & Spieluhren" },
      { name: "Spielbogen & Spielmatten" }
    ]},
    { name: "Babypflege", children: [
      { name: "Bademäntel, Kapuzenhandtücher & Waschlappen" },
      { name: "Baden & Pflegen" },
      { name: "Lätzchen" },
      { name: "Schnuller" },
      { name: "Stoffwindeln" },
      { name: "Wickeln" }
    ]},
    { name: "Babys erste Kleidung", children: [
      { name: "Babyhosen" },
      { name: "Bio-Basics" },
      { name: "Bio-Wollfleece" },
      { name: "Bodies" },
      { name: "Jäckchen & Pullis" },
      { name: "Mützchen & Füßlinge" },
      { name: "Pyjamas & Overalls" },
      { name: "T-Shirts & Tops" }
    ]},
    { name: "Babytragen" },
    { name: "Babyzimmer", children: [
      { name: "Babybetten" },
      { name: "Babynestchen" },
      { name: "Babyschlafsäcke" },
      { name: "Babywippen & Hochstühle" },
      { name: "Betthimmel" },
      { name: "Mobile & Spieluhren" },
      { name: "Wickelkommoden" },
      { name: "Wiegen & Beistellbettchen" }
    ]},
    { name: "Für Mamas", children: [
      { name: "Baby Geschenke" },
      { name: "Babytragen" },
      { name: "Deko" },
      { name: "Im Urlaub" },
      { name: "Schwangerschaft & Stillen", children: [
        { name: "Milchpumpen & Fläschchen" },
        { name: "Schnuller" },
        { name: "Still- & Schwangerschaftskleidung" },
        { name: "Stillkissen" }
      ]},
      { name: "Wickeltaschen- & Rucksäcke", children: [
        { name: "Organizer" },
        { name: "Taschen" },
        { name: "Wickelrucksäcke" },
        { name: "Wickelunterlagen" }
      ]}
    ]}
  ]},
  { name: "Back to School", children: [
    { name: "Buchstaben Spaß" },
    { name: "Für die Schultüte" },
    { name: "Kinderschreibtische & Stühle" },
    { name: "Klein-Aufbewahrung" },
    { name: "Lederhausschuhe" },
    { name: "Regen- & Outdoorkleidung" },
    { name: "Rucksäcke & Turnbeutel" },
    { name: "Schüttelpenale" },
    { name: "Trinkflaschen & Jausenboxen" }
  ]},
  { name: "Bio-Basics & Wollfleece", children: [
    { name: "Basics 0 bis 4 J" },
    { name: "Frühchen" },
    { name: "Für Mamas" },
    { name: "Wollfleece" }
  ]},
  { name: "Bücher & Tonies", children: [
    { name: "Kinderbücher" },
    { name: "Ratgeber" },
    { name: "Tonies" }
  ]},
  { name: "Frühling", children: [
    { name: "Alles Hase" },
    { name: "Badeurlaub mit Kindern" },
    { name: "Essenszeit" },
    { name: "Frühlingsmode" },
    { name: "Fürs Osternest" },
    { name: "Im Frühling Unterwegs" },
    { name: "Ostern", children: [
      { name: "Klettern, Rutschen & Schaukeln" },
      { name: "Laufräder & Dreiräder" },
      { name: "Oster Specials" },
      { name: "Osterkörbchen" },
      { name: "Puppenwelt" },
      { name: "Rollenspiele" },
      { name: "Tipis & Co." }
    ]},
    { name: "Rund ums Schlafen" },
    { name: "Übergangskleidung" },
    { name: "Zimmer dekorieren", children: [
      { name: "Schlaf gut, Baby" }
    ]},
    { name: "Zum Muttertag" }
  ]},
  { name: "Gutscheine", children: [
    { name: "Gutschein selbst ausdrucken" },
    { name: "Postversand" }
  ]},
  { name: "Herbst", children: [
    { name: "Bio-Wollfleece" },
    { name: "Herbstmode" },
    { name: "Im Herbst Unterwegs", children: [
      { name: "Babytragen & Wickeltaschen" },
      { name: "Kinderwagen & Buggys" },
      { name: "Laufräder & Dreiräder" },
      { name: "Regenkleidung" },
      { name: "Rucksäcke" },
      { name: "Trinken & Essen To Go" }
    ]},
    { name: "Indoor Spielen", children: [
      { name: "Krabbelsocken" },
      { name: "Krabbelsocken etc." },
      { name: "Lederhausschuhe" },
      { name: "Spielmatten & Tipis" }
    ]},
    { name: "Mein Zimmer Einrichten", children: [
      { name: "Kindermöbel Bestseller" },
      { name: "Kinderschreibtische" },
      { name: "Klein-Aufbewahrung" },
      { name: "Lampen & Nachtlichter" },
      { name: "Teppiche" },
      { name: "Zimmer Deko" }
    ]},
    { name: "Schlaf Gut Baby", children: [
      { name: "Decken" },
      { name: "Kuscheltiere" },
      { name: "Nestchen" },
      { name: "Pyjamas" },
      { name: "Schlafsäcke" }
    ]}
  ]},
  { name: "Home & Deko", children: [
    { name: "Fürs Badezimmer", children: [
      { name: "Bademäntel & Handtücher" },
      { name: "Klein Aufbewahrung" },
      { name: "Wickeln & Pflegen" }
    ]},
    { name: "Kindergeschirr", children: [
      { name: "Geschirrsets" },
      { name: "Jausenboxen" },
      { name: "Kinderbesteck" },
      { name: "Lätzchen" },
      { name: "Teller & Tassen" },
      { name: "Trinkflaschen" }
    ]},
    { name: "Kinderzimmer Deko", children: [
      { name: "Aufbewahrung" },
      { name: "Betthimmel" },
      { name: "Dekokissen" },
      { name: "Lampen & Nachtlichter" },
      { name: "Mobile & Spieluhren" },
      { name: "Sessel & Sofas" },
      { name: "Spielmatten & Krabbeldecken" },
      { name: "Teppiche" },
      { name: "Tipis & Matten" }
    ]},
    { name: "Papeterie" },
    { name: "Rund ums Schlafen", children: [
      { name: "Babydecken" },
      { name: "Babynestchen" },
      { name: "Babyschlafsäcke" },
      { name: "Bettwäsche" }
    ]},
    { name: "Wanddeko", children: [
      { name: "Girlanden" },
      { name: "Lichterketten" },
      { name: "Wandfarbe, Lack & Tapete", children: [
        { name: "Lack auf Wasserbasis" },
        { name: "Wandfarbe Dispersion" }
      ]},
      { name: "Wandregale & Deko" }
    ]}
  ]},
  { name: "Kassenartikel", children: [
    { name: "Möbel Aktion" },
    { name: "Möbel für Große" }
  ]},
  { name: "Kinderwagen", children: [
    { name: "BUGABOO", children: [
      { name: "Butterfly 2" },
      { name: "Donkey 6" },
      { name: "Dragonfly" },
      { name: "Dragonfly Plus" },
      { name: "Fox 5" },
      { name: "Fox 5 Renew" },
      { name: "Zubehör" }
    ]},
    { name: "CYBEX", children: [
      { name: "Autositze" },
      { name: "Coya" },
      { name: "e-Gazelle S" },
      { name: "e-Priam" },
      { name: "Gazelle S" },
      { name: "Priam & e-Priam" },
      { name: "Zubehör" }
    ]},
    { name: "JOOLZ", children: [
      { name: "Aer 2" },
      { name: "Aer/Aer+" },
      { name: "Day 5" },
      { name: "Geo 3" },
      { name: "Geo 5" },
      { name: "Hub 2" },
      { name: "Zubehör" }
    ]},
    { name: "Kinderautositze", children: [
      { name: "CYBEX" },
      { name: "MAXI COSI" },
      { name: "THULE" }
    ]},
    { name: "MAXI COSI", children: [
      { name: "Autositze" },
      { name: "Fame" }
    ]},
    { name: "MOZOMOZA" },
    { name: "NATURKIND", children: [
      { name: "Ida" },
      { name: "Lars" },
      { name: "Lux Evo" },
      { name: "Mads" },
      { name: "Zubehör" }
    ]},
    { name: "STOKKE", children: [
      { name: "YOYO³" },
      { name: "Zubehör" }
    ]},
    { name: "TERNX" },
    { name: "THULE", children: [
      { name: "Autositze" },
      { name: "Charm" },
      { name: "Sleek 2" },
      { name: "Spring 2" },
      { name: "Urban Glide 3" },
      { name: "Urban Glide 4-wheel" }
    ]},
    { name: "Zubehör", children: [
      { name: "BABYJOGGER Zubehör" },
      { name: "Fuß- & Fellsäcke" },
      { name: "Matratzen" },
      { name: "PHIL & TEDS Zubehör" },
      { name: "Sitzauflagen" },
      { name: "Wickeltaschen" }
    ]}
  ]},
  { name: "Möbel", children: [
    { name: "Babyzimmer", children: [
      { name: "Babybetten" },
      { name: "Babywippen & Hochstühle" },
      { name: "Betthimmel" },
      { name: "Mobile & Spieluhren" },
      { name: "Nestchen" },
      { name: "Wickelkissen & Auflagen" },
      { name: "Wickelkommoden" },
      { name: "Wiegen & Beistellbettchen" }
    ]},
    { name: "Hochstühle" },
    { name: "Kinderzimmer", children: [
      { name: "Betten", children: [
        { name: "Baby & Toddler" },
        { name: "Boden & Montessori Betten" },
        { name: "Combiflex einzelne Artikel" },
        { name: "Hoch- & Stockbetten" },
        { name: "Kinderbetten" },
        { name: "Matratzen", children: [
          { name: "Beistellbett- & Wiegen Matratzen" },
          { name: "Gitterbettmatratzen" },
          { name: "Jugendbettmatratzen" }
        ]},
        { name: "Reisebetten" },
        { name: "System-Betten" },
        { name: "Wiegen & Beistellbettchen" }
      ]},
      { name: "Kindertische & Stühle" },
      { name: "Klettern, Rutschen & Schaukeln" },
      { name: "Kommoden & Wickeltische" },
      { name: "Matratzen", children: [
        { name: "Beistellbett- & Wiegen Matratzen" },
        { name: "Gitterbettmatratzen" },
        { name: "Jugendbettmatratzen" }
      ]},
      { name: "Möbelzubehör", children: [
        { name: "BABYBAY Zubehör" },
        { name: "BABYHOME Zubehör" },
        { name: "BLOOM Zubehör" },
        { name: "BOPITA Zubehör" },
        { name: "LEANDER Zubehör" },
        { name: "OEUF Zubehör" },
        { name: "STOKKE Zubehör" }
      ]},
      { name: "Regale" },
      { name: "Schränke" },
      { name: "Schreibtische" },
      { name: "Sessel & Sofas" },
      { name: "Spielhäuser & Tipis" }
    ]},
    { name: "Rund ums Schlafen", children: [
      { name: "Babyschlafsäcke" },
      { name: "Bettwäsche" },
      { name: "Decken" },
      { name: "Nestchen" }
    ]},
    { name: "Wandfarbe, Lack & Tapete", children: [
      { name: "Lack auf Wasserbasis" },
      { name: "Tapeten & Wandsticker" },
      { name: "Wandfarbe Dispersion" }
    ]},
    { name: "Zimmer Deko", children: [
      { name: "Aufbewahrung" },
      { name: "Betthimmel" },
      { name: "Dekokissen" },
      { name: "Krabbeldecken" },
      { name: "Lampen & Nachtlichter" },
      { name: "Teppiche" }
    ]}
  ]},
  { name: "Mode", children: [
    { name: "Bademode & UV-Schutz", children: [
      { name: "Badehosen- & anzüge" },
      { name: "Bademäntel" },
      { name: "Badeschuhe" },
      { name: "Badewindeln" },
      { name: "Schwimmlernwesten" },
      { name: "Sonnenbrillen" },
      { name: "Sonnenhüte- & kappen" },
      { name: "UV-Schutz T-Shirts" }
    ]},
    { name: "Kindermode 0 bis 5J", children: [
      { name: "Bio-Basics" },
      { name: "Bodies" },
      { name: "Hauben & Füßlinge" },
      { name: "Hosen & Leggings" },
      { name: "Jäckchen & Pullover" },
      { name: "Kleidchen & Röcke" },
      { name: "Pyjamas, Overalls & Strampler" },
      { name: "Shorts & Babyhöschen" },
      { name: "Socken & Strümpfe" },
      { name: "T-Shirts & Tops" },
      { name: "Wolle" }
    ]},
    { name: "Outdoormode bis 6J", children: [
      { name: "Bio-Wollfleece" },
      { name: "Krabbelsocken & Lederpatschen" },
      { name: "Mützen, Handschuhe & Schals" },
      { name: "Schneeoveralls & Outdoorhosen" },
      { name: "Übergang & Regen" },
      { name: "Winterjacken" }
    ]},
    { name: "Rucksäcke & Taschen", children: [
      { name: "Kinderkoffer" },
      { name: "Kinderrucksäcke" },
      { name: "Täschchen" },
      { name: "Turnbeutel" }
    ]},
    { name: "Schuhe", children: [
      { name: "Babyschuhe" },
      { name: "Lederhausschuhe" },
      { name: "Sandalen" },
      { name: "Stiefel" }
    ]}
  ]},
  { name: "Schenken Tut Gut", children: [
    { name: "Für Abenteuer drinnen oder draußen" },
    { name: "Für Fantasie, Geschichten & Weltenbauer" },
    { name: "Für Kinder, die schon (fast) alles haben" },
    { name: "Für kleine Rituale" },
    { name: "Für warme Winterkinder" }
  ]},
  { name: "Sommer", children: [
    { name: "Bademode & UV-Schutz" },
    { name: "Im Sommer Unterwegs" },
    { name: "Reisebetten" },
    { name: "Sand & -Wasserspielzeug" },
    { name: "Sommermode" }
  ]},
  { name: "Spielen", children: [
    { name: "Baby Spielsachen", children: [
      { name: "Badespielzeug" },
      { name: "Beißringe & Rasseln" },
      { name: "Schmusetücher" },
      { name: "Spielbögen & Spielmatten" },
      { name: "Spieluhren & Mobile" },
      { name: "Wagen- & Schnullerketten" }
    ]},
    { name: "Bücher", children: [
      { name: "Bilderbücher" },
      { name: "Buch mit CD" },
      { name: "Kinderbücher" },
      { name: "Liederbücher" },
      { name: "Mal- und Bastelbücher" },
      { name: "Ratgeber" },
      { name: "Sachbücher" },
      { name: "Schwangerschaft" },
      { name: "Vorlesen & selber lesen" }
    ]},
    { name: "Kinderspielzeug", children: [
      { name: "Autos & Co" },
      { name: "Holzeisenbahn" },
      { name: "Holzspielzeug" },
      { name: "Klettern, Rutschen & Schaukeln" },
      { name: "Küche & Kaufladen" },
      { name: "Kugelbahnen" },
      { name: "Laufräder & Scooter" },
      { name: "Malen & Basteln" },
      { name: "Musikinstrumente" },
      { name: "Puppenwelt & Puppenhäuser" },
      { name: "Spiele & Puzzles" },
      { name: "Stofftiere" },
      { name: "Tipis & Spielhäuser" },
      { name: "Toniebox & Hörgeschichten" }
    ]},
    { name: "Spielen nach Alter", children: [
      { name: "12", children: [
        { name: "24 Monate" }
      ]},
      { name: "24", children: [
        { name: "36 Monate" }
      ]},
      { name: "3", children: [
        { name: "5 Jahre" }
      ]},
      { name: "5+ Jahre" },
      { name: "6", children: [
        { name: "12 Monate" }
      ]},
      { name: "bis 6 Monate" }
    ]},
    { name: "Spielen nach Thema", children: [
      { name: "Für unterwegs" },
      { name: "Kreativ" },
      { name: "Laufenlernhilfe" },
      { name: "Lernspiele" },
      { name: "Rollenspiele" },
      { name: "Rollenspiele Spielen" }
    ]}
  ]},
  { name: "Versand", children: [
    { name: "Noch nicht zugeordnet" },
    { name: "Service & Dienstleistungen" }
  ]},
  { name: "Winter", children: [
    { name: "Bio-Wollfleece" },
    { name: "Im Winter Unterwegs", children: [
      { name: "Auf Rädern" },
      { name: "Fuß- & Fellsäcke" },
      { name: "Kinderwagen & Autositze" },
      { name: "Trinken & Essen To Go" },
      { name: "Wickeltaschen & Rucksäcke" },
      { name: "Winterkleidung" },
      { name: "Wolle" }
    ]},
    { name: "Indoor Spielen", children: [
      { name: "24", children: [
        { name: "36 Monate" }
      ]},
      { name: "3", children: [
        { name: "5 Jahre" }
      ]},
      { name: "5+ Jahre" },
      { name: "Krabbelmatten & Spielbögen" },
      { name: "Krabbelsocken & Lederpatschen" },
      { name: "Rutschen, Schaukeln & Verstecken" },
      { name: "Stofftiere" }
    ]},
    { name: "Mein Zimmer einrichten", children: [
      { name: "Beleuchtung" },
      { name: "Kindermöbel Bestseller" },
      { name: "Klein-Aufbewahrung" },
      { name: "Spieluhren & Mobile" },
      { name: "Teppiche" },
      { name: "Zimmer Deko" }
    ]},
    { name: "Schlaf gut Baby", children: [
      { name: "Bettwäsche" },
      { name: "Kuscheln" },
      { name: "Nachtlichter" },
      { name: "Nestchen & Decken" },
      { name: "Pyjamas" },
      { name: "Schlafsäcke" }
    ]}
  ]},
  { name: "XMAS-Shop", children: [
    { name: "Für Nikolo & Adventskalender" },
    { name: "Im Winter unterwegs", children: [
      { name: "Fellsäcke & Fußsäcke" },
      { name: "Mützen, Handschuhe & Schals" },
      { name: "Trinken & Essen To Go" },
      { name: "Wickeltaschen & Rucksäcke" },
      { name: "Winterbekleidung" }
    ]},
    { name: "Mein Zimmer einrichten", children: [
      { name: "Beleuchtung" },
      { name: "Kindermöbel Bestseller" },
      { name: "Klein-Aufbewahrung" },
      { name: "Spieluhren & Mobile" },
      { name: "Zimmer Deko" }
    ]},
    { name: "Motorik- & Bewegungsspiele", children: [
      { name: "Krabbelmatten & Spielbögen" },
      { name: "Krabbelsocken & Lederpatschen" }
    ]},
    { name: "Schenken tut gut", children: [
      { name: "Für Abenteuer drinnen oder draußen" },
      { name: "Für Fantasie, Geschichten & Weltenbauer" },
      { name: "Für Kinder, die schon (fast) alles haben" },
      { name: "Für kleine Rituale" }
    ]},
    { name: "Schlaf gut Baby", children: [
      { name: "Bettwäsche" },
      { name: "Kuscheln" },
      { name: "Nestchen & Decken" },
      { name: "Pyjamas" },
      { name: "Schlafsäcke" }
    ]},
    { name: "Spielen nach Alter", children: [
      { name: "12", children: [
        { name: "24 Monate" }
      ]},
      { name: "24", children: [
        { name: "36 Monate" }
      ]},
      { name: "3", children: [
        { name: "5 Jahre" }
      ]},
      { name: "5+ Jahre" },
      { name: "6", children: [
        { name: "12 Monate" }
      ]},
      { name: "bis 6 Monate" }
    ]},
    { name: "Wunschliste fürs Christkind" }
  ]}
];
