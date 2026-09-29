// lib/museum.js
// MUSEUM - the gallery of Merlin's creative output.
// Pure data + helpers. No DOM, no network. Headless-testable.
// Art sources: Tier-A selections from the Takeout Gemini archive.
// NEVER add Tier-B (IP-risk) or Tier-C (excluded) art here.

export const SERIES = [
  { id: 'valkyrie', title: "Valkyrie", blurb: "The Valkyrie marks - neon sigil and golden eagle. The face of the referral program.", count: 2 },
  { id: 'gold-robot', title: "Gold Robot", blurb: "The brand mascot: a golden robot wandering portals, arenas, stadiums, and neon cities.", count: 17 },
  { id: 'neon', title: "Neon", blurb: "Neon-drenched studies - animals, skylines, maps, and machines drawn in light.", count: 21 },
  { id: 'posters', title: "Poster Studies", blurb: "The satirical vintage-poster series - parody educational posters with a straight face.", count: 18 },
  { id: 'branding', title: "Branding", blurb: "Olympus, Artemis, and Vortex marks - the sigils of the empire.", count: 19 },
  { id: 'fortress', title: "Fortress of Solitude", blurb: "The four tier posters - God, Elder, Kryptonian, Acolyte.", count: 4 },
  { id: 'gems', title: "Gems", blurb: "Gem icons and crystal stickers - the visual language of Liquid Gold.", count: 6 },
  { id: 'starblood', title: "Starblood", blurb: "Card art from the Starblood prototype - blood-drop sigils and creature cards.", count: 6 },
  { id: 'innodigym', title: "InnoDigym", blurb: "The Midas fitness posters - gold-age strength, four divine modes.", count: 3 },
  { id: 'key-art', title: "Key Art", blurb: "Anchor pieces - the Fleet, the Neon Architect, the Underworld, the Colosseum.", count: 5 },
  { id: 'textures', title: "Textures", blurb: "World-building raw material - planet maps and all-over-print textures.", count: 6 },
];

export const ITEMS = [
  { id: 'g001', series: 'branding', title: "KHAOS - Neon Login", blurb: "Cyberpunk login mockup.", src: '/textures/museum/branding/1000000087-c1f0b4e4294e476f.jpg' },
  { id: 'g002', series: 'branding', title: "Crystal Trophy", blurb: "A crystal rendered like a trophy.", src: '/textures/museum/branding/1000000254-3602b9c54bffea99.png' },
  { id: 'g003', series: 'branding', title: "Ring Badge", blurb: "A glowing circular badge.", src: '/textures/museum/branding/1000000274-3af05562f042edaf.jpg' },
  { id: 'g004', series: 'branding', title: "Olympian Hoodies x Maps", blurb: "Maps pins and planets - a branding concept.", src: '/textures/museum/branding/1000000347-fc5540c1a3c94836.jpg' },
  { id: 'g005', series: 'branding', title: "Olympian Hoodies x Maps II", blurb: "Second study of the maps concept.", src: '/textures/museum/branding/1000000348-4059a24eef19beaa.png' },
  { id: 'g006', series: 'branding', title: "Olympus - Lightning Mark", blurb: "The lightning logo.", src: '/textures/museum/branding/1000034352-bd64e830a89941dd.jpg' },
  { id: 'g007', series: 'branding', title: "Olympus - Lightning Mark", blurb: "The lightning logo.", src: '/textures/museum/branding/1000034352-c91ea851e07f2e5d.jpg' },
  { id: 'g008', series: 'branding', title: "Grief Gully", blurb: "Mossy title logo for a game concept.", src: '/textures/museum/branding/1000034584-2441e169518f8039.jpg' },
  { id: 'g009', series: 'branding', title: "Project Artemis - Neon Sigil", blurb: "Pink and blue neon. The mythic name, claimed.", src: '/textures/museum/branding/1000034987-c8ce26587bc49393.jpg' },
  { id: 'g010', series: 'branding', title: "Project Artemis - Gold Sigil", blurb: "The Artemis mark in gold.", src: '/textures/museum/branding/1000035106-38ba4285e828abfd.jpg' },
  { id: 'g011', series: 'branding', title: "Project Artemis - Violet Sigil", blurb: "The Artemis mark in violet.", src: '/textures/museum/branding/1000035141-bd64e830a89941dd.jpg' },
  { id: 'g012', series: 'branding', title: "Olympus - Lightning Mark II", blurb: "Second study of the lightning mark.", src: '/textures/museum/branding/1000036397-26c31a7ccec427b0.png' },
  { id: 'g013', series: 'branding', title: "Delusions of Grandeur", blurb: "The D.O.G. text-mark series.", src: '/textures/museum/branding/1000036430-8d747833dbdbbaa9.png' },
  { id: 'g014', series: 'branding', title: "Delusions of Grandeur II", blurb: "Second study.", src: '/textures/museum/branding/1000036432-4445cf38c6d35818.png' },
  { id: 'g015', series: 'branding', title: "Olympus - Red Neon", blurb: "The mark in red neon.", src: '/textures/museum/branding/1000036947-aa2b613a61f04416.png' },
  { id: 'g016', series: 'branding', title: "Olympus - Purple Neon", blurb: "The mark in purple neon.", src: '/textures/museum/branding/1000036955-7e2ac87f12597f3b.png' },
  { id: 'g017', series: 'branding', title: "The Rules of the Vortex", blurb: "The house rules, posterized.", src: '/textures/museum/branding/10731453464660201708-504e3988d0e0ad85.jpg' },
  { id: 'g018', series: 'branding', title: "The Library of Alexandria - OG Cloud Storage", blurb: "The Alexandria brand, posterized.", src: '/textures/museum/branding/12779041827959598981-d2306aa27505de54.jpg' },
  { id: 'g019', series: 'branding', title: "The Rules of the Vortex - Jumanji", blurb: "The Jumanji variant.", src: '/textures/museum/branding/12853820834072830183-3c7c2a10a9c58494.png' },
  { id: 'g020', series: 'fortress', title: "Fortress of Solitude - Tier Poster I", blurb: "One of the four tier posters.", src: '/textures/museum/fortress/1000000872-091969f5c8ab4795.png' },
  { id: 'g021', series: 'fortress', title: "Fortress of Solitude - Tier Poster II", blurb: "One of the four tier posters.", src: '/textures/museum/fortress/1000000873-091969f5c8ab4795.png' },
  { id: 'g022', series: 'fortress', title: "Fortress of Solitude - Tier Poster III", blurb: "One of the four tier posters.", src: '/textures/museum/fortress/1000000874-091969f5c8ab4795.png' },
  { id: 'g023', series: 'fortress', title: "Fortress of Solitude - Tier Poster IV", blurb: "One of the four tier posters.", src: '/textures/museum/fortress/1000000875-091969f5c8ab4795.png' },
  { id: 'g024', series: 'gems', title: "Gem Study No. 1", blurb: "", src: '/textures/museum/gems/1000035384-c9fa767a8a274c06.jpg' },
  { id: 'g025', series: 'gems', title: "Gem Study No. 2", blurb: "", src: '/textures/museum/gems/1000035417-78e4ffcc28facd92.jpg' },
  { id: 'g026', series: 'gems', title: "Gem Study No. 3", blurb: "", src: '/textures/museum/gems/sticker1329546322929129060-7abc6c0b4bce8f39.jpg' },
  { id: 'g027', series: 'gems', title: "Gem Study No. 4", blurb: "", src: '/textures/museum/gems/sticker1942909842796531768-9d0f2ddbd76d5918.jpg' },
  { id: 'g028', series: 'gems', title: "Gem Study No. 5", blurb: "", src: '/textures/museum/gems/sticker441181274856034979-3d8083251bcaa687.jpg' },
  { id: 'g029', series: 'gems', title: "Gem Study No. 6", blurb: "", src: '/textures/museum/gems/sticker5852881199341584401-43747216d7f93359.jpg' },
  { id: 'g030', series: 'gold-robot', title: "Gold and Black Study I", blurb: "Ornate gold-on-black render.", src: '/textures/museum/gold-robot/1000000096-003a627c5c0adbce.png' },
  { id: 'g031', series: 'gold-robot', title: "Gold and Black Study II", blurb: "The robot among orbiting portals.", src: '/textures/museum/gold-robot/1000000104-003a627c5c0adbce.png' },
  { id: 'g032', series: 'gold-robot', title: "Gold Robot No. 3", blurb: "", src: '/textures/museum/gold-robot/1000034353-4a55cf810186151d.jpg' },
  { id: 'g033', series: 'gold-robot', title: "Gold Robot No. 4", blurb: "", src: '/textures/museum/gold-robot/1000034358-bd64e830a89941dd.jpg' },
  { id: 'g034', series: 'gold-robot', title: "Gold Robot No. 5", blurb: "", src: '/textures/museum/gold-robot/1000034361-c27e67bccc585dc2.jpg' },
  { id: 'g035', series: 'gold-robot', title: "Gold Robot No. 6", blurb: "", src: '/textures/museum/gold-robot/1000034364-bd64e830a89941dd.jpg' },
  { id: 'g036', series: 'gold-robot', title: "Gold Robot No. 7", blurb: "", src: '/textures/museum/gold-robot/1000034385-881d9a493fce3c05.jpg' },
  { id: 'g037', series: 'gold-robot', title: "Gold Robot No. 8", blurb: "", src: '/textures/museum/gold-robot/1000034683-e80d6876ebc96895.jpg' },
  { id: 'g038', series: 'gold-robot', title: "Gold Robot No. 9", blurb: "", src: '/textures/museum/gold-robot/1000034973-3bd234fe01a23790.jpg' },
  { id: 'g039', series: 'gold-robot', title: "Gold Robot No. 10", blurb: "", src: '/textures/museum/gold-robot/1000034974-40571f9266cc6b4a.jpg' },
  { id: 'g040', series: 'gold-robot', title: "Gold Robot No. 11", blurb: "", src: '/textures/museum/gold-robot/1000034975-3bd234fe01a23790.jpg' },
  { id: 'g041', series: 'gold-robot', title: "Gold Robot No. 12", blurb: "", src: '/textures/museum/gold-robot/1000034976-3bd234fe01a23790.jpg' },
  { id: 'g042', series: 'gold-robot', title: "Astronaut in the Neon Forest", blurb: "The gold robot, exploring.", src: '/textures/museum/gold-robot/1000034978-23bb224e323dc86a.jpg' },
  { id: 'g043', series: 'gold-robot', title: "Gold Robot No. 14", blurb: "", src: '/textures/museum/gold-robot/1000035639-c2ad7b41b814e497.png' },
  { id: 'g044', series: 'gold-robot', title: "Gold Robot No. 15", blurb: "", src: '/textures/museum/gold-robot/1000035642-8505c2dbd79e66d8.jpg' },
  { id: 'g045', series: 'gold-robot', title: "Gold Robot No. 16", blurb: "", src: '/textures/museum/gold-robot/1000035648-a91b3dc8fde80ef0.jpg' },
  { id: 'g046', series: 'gold-robot', title: "Gold Robot No. 17", blurb: "", src: '/textures/museum/gold-robot/1000035656-9e5b6d2e23dba8a7.png' },
  { id: 'g047', series: 'innodigym', title: "Midas and the Digital Strength I", blurb: "Gold helmet figure. Four divine modes.", src: '/textures/museum/innodigym/watermarked_img_12678709398296924-b31cb1e3afaea0d8.jpg' },
  { id: 'g048', series: 'innodigym', title: "Midas and the Digital Strength II", blurb: "The gold wrestler medallion.", src: '/textures/museum/innodigym/watermarked_img_26449700079239291-8d84b14818bce564.jpg' },
  { id: 'g049', series: 'innodigym', title: "Midas and the Digital Strength III", blurb: "Gold statues and the anatomy hologram.", src: '/textures/museum/innodigym/watermarked_img_50396193935583159-de1c16960ad41a61.png' },
  { id: 'g050', series: 'key-art', title: "Underworld Gaming", blurb: "Storefront UI mockup.", src: '/textures/museum/key-art/watermarked_img_10456753351931223-f13858e5fee0c44b.png' },
  { id: 'g051', series: 'key-art', title: "The Fleet", blurb: "FLEET over a cyan Omega on a starfield. The concept behind ARGO.", src: '/textures/museum/key-art/watermarked_img_11589868396736077-43d96fe0148684e2.png' },
  { id: 'g052', series: 'key-art', title: "Colosseum Concept", blurb: "Golden vortex and lightning over the arena wall.", src: '/textures/museum/key-art/watermarked_img_11862710179529467-8a4f9fe5a1602480.jpg' },
  { id: 'g053', series: 'key-art', title: "The Neon Architect", blurb: "An armored figure manifesting a gold icosahedron. World Engine key art.", src: '/textures/museum/key-art/watermarked_img_15151931901401104-9f0bda1577417b92.png' },
  { id: 'g054', series: 'key-art', title: "Street Neon", blurb: "Graffiti street-art for the bike line.", src: '/textures/museum/key-art/watermarked_img_50346504337610812-eb28da88ba01116d.png' },
  { id: 'g055', series: 'neon', title: "Be My Valentine", blurb: "Neon valentine.", src: '/textures/museum/neon/1000022811-93d1777d4d6d71ed.jpg' },
  { id: 'g056', series: 'neon', title: "Neon Tacos", blurb: "Tacos in neon. Because why not.", src: '/textures/museum/neon/1000022913-d130b0b8cf1c5f1a.jpg' },
  { id: 'g057', series: 'neon', title: "Neon Airplane", blurb: "An airplane in neon.", src: '/textures/museum/neon/1000022914-d130b0b8cf1c5f1a.jpg' },
  { id: 'g058', series: 'neon', title: "Cyberpunk Study", blurb: "A figure in the neon rain.", src: '/textures/museum/neon/1000027046-d130b0b8cf1c5f1a.png' },
  { id: 'g059', series: 'neon', title: "Ghost Ship", blurb: "A ship that sails without a crew.", src: '/textures/museum/neon/1000027048-d130b0b8cf1c5f1a.png' },
  { id: 'g060', series: 'neon', title: "British Columbia - Neon Map", blurb: "The province, drawn in light.", src: '/textures/museum/neon/1000027303-86b30b2b354200d7.jpg' },
  { id: 'g061', series: 'neon', title: "British Columbia - Neon Map", blurb: "The province, drawn in light.", src: '/textures/museum/neon/1000027303-afd7d7623924c5f2.jpg' },
  { id: 'g062', series: 'neon', title: "Neon Fox", blurb: "A fox in neon.", src: '/textures/museum/neon/1000028511-17d6e22ce8d73cb3.jpg' },
  { id: 'g063', series: 'neon', title: "Neon Rhino", blurb: "A rhino in neon.", src: '/textures/museum/neon/1000028517-17d6e22ce8d73cb3.jpg' },
  { id: 'g064', series: 'neon', title: "Neon Elephants", blurb: "Elephants in neon.", src: '/textures/museum/neon/1000028520-17d6e22ce8d73cb3.jpg' },
  { id: 'g065', series: 'neon', title: "Canada - Neon Map", blurb: "The country in pink neon.", src: '/textures/museum/neon/1000028569-c91ea851e07f2e5d.jpg' },
  { id: 'g066', series: 'neon', title: "Lightning Tiger", blurb: "A tiger drawn in lightning.", src: '/textures/museum/neon/1000030162-17d6e22ce8d73cb3.jpg' },
  { id: 'g067', series: 'neon', title: "Toronto in Lightning", blurb: "The Toronto skyline under a lightning storm.", src: '/textures/museum/neon/1000031243-d512338611b830b6.jpg' },
  { id: 'g068', series: 'neon', title: "Headless Horseman", blurb: "The rider, in neon.", src: '/textures/museum/neon/1000031901-38b5691d9d899cac.jpg' },
  { id: 'g069', series: 'neon', title: "Storm Ship", blurb: "A ship riding out the storm.", src: '/textures/museum/neon/1000031910-38b5691d9d899cac.jpg' },
  { id: 'g070', series: 'neon', title: "Starship Down", blurb: "A spaceship coming apart in fire.", src: '/textures/museum/neon/1000032215-0e2372e1d9e90a68.jpg' },
  { id: 'g071', series: 'neon', title: "Canada - Neon Map II", blurb: "The country in neon, second study.", src: '/textures/museum/neon/1000034126-d6115b8705ecbff5.jpg' },
  { id: 'g072', series: 'neon', title: "Alberta - Neon Sign", blurb: "Home, in neon.", src: '/textures/museum/neon/1000034141-bdacf4ea9d739d3f.jpg' },
  { id: 'g073', series: 'neon', title: "Phoenix Over the City", blurb: "The phoenix rises over the skyline.", src: '/textures/museum/neon/10287651986086249368-40089a2df2f01ccd.jpg' },
  { id: 'g074', series: 'neon', title: "Olympus - See You in Florida", blurb: "A send-off poster.", src: '/textures/museum/neon/1043923238029648688-ee91e647a69f9a0c.jpg' },
  { id: 'g075', series: 'neon', title: "I Could Do This All Day", blurb: "The eagle. Enough said.", src: '/textures/museum/neon/11529625600360394090-95c9e759f089554c.jpg' },
  { id: 'g076', series: 'posters', title: "Poster Study No. 1", blurb: "", src: '/textures/museum/posters/13984416567391026769-abf63efe69e7327c.jpg' },
  { id: 'g077', series: 'posters', title: "Poster Study No. 2", blurb: "", src: '/textures/museum/posters/1623014909984339113-0a48bf55e439b483.jpg' },
  { id: 'g078', series: 'posters', title: "Poster Study No. 3", blurb: "", src: '/textures/museum/posters/16976372808653671479-fcead1f381bcfabf.png' },
  { id: 'g079', series: 'posters', title: "Poster Study No. 4", blurb: "", src: '/textures/museum/posters/17019305716306476496-38ed952c1ae57361.jpg' },
  { id: 'g080', series: 'posters', title: "Poster Study No. 5", blurb: "", src: '/textures/museum/posters/1752023411086065109-3c56093b55f42a6b.jpg' },
  { id: 'g081', series: 'posters', title: "Poster Study No. 6", blurb: "", src: '/textures/museum/posters/17995745695968974281-29f09b2885e96398.jpg' },
  { id: 'g082', series: 'posters', title: "Poster Study No. 7", blurb: "", src: '/textures/museum/posters/2229567337379841719-1ac741333deb8b99.jpg' },
  { id: 'g083', series: 'posters', title: "Poster Study No. 8", blurb: "", src: '/textures/museum/posters/245a5c96-3b6e-43e3-b6cd-e0559f552-d05ce96da132d5ed.jpg' },
  { id: 'g084', series: 'posters', title: "Poster Study No. 9", blurb: "", src: '/textures/museum/posters/2483853696531823122-a6367260481639b1.jpg' },
  { id: 'g085', series: 'posters', title: "Poster Study No. 10", blurb: "", src: '/textures/museum/posters/2511960933666464044-a7155a5e6955601c.jpg' },
  { id: 'g086', series: 'posters', title: "Poster Study No. 11", blurb: "", src: '/textures/museum/posters/2557556577055194419-6b6b30ab6bde21a4.png' },
  { id: 'g087', series: 'posters', title: "Poster Study No. 12", blurb: "", src: '/textures/museum/posters/263703776636696512-bd638e7141898344.jpg' },
  { id: 'g088', series: 'posters', title: "Poster Study No. 13", blurb: "", src: '/textures/museum/posters/2761860229779004534-690570d564c223a2.png' },
  { id: 'g089', series: 'posters', title: "Poster Study No. 14", blurb: "", src: '/textures/museum/posters/2839454874951988323-8033c842eb314a6f.png' },
  { id: 'g090', series: 'posters', title: "Poster Study No. 15", blurb: "", src: '/textures/museum/posters/2883292419759602774-7ea08062805cfd18.jpg' },
  { id: 'g091', series: 'posters', title: "Poster Study No. 16", blurb: "", src: '/textures/museum/posters/3279398379234225642-7f4a88d87f5d6c84.jpg' },
  { id: 'g092', series: 'posters', title: "Poster Study No. 17", blurb: "", src: '/textures/museum/posters/32fb6e9a-99d0-4ed4-b747-4845cf015-d05ce96da132d5ed.jpg' },
  { id: 'g093', series: 'posters', title: "Poster Study No. 18", blurb: "", src: '/textures/museum/posters/4296846564507005597-e3b72b96cbe43ec6.jpg' },
  { id: 'g094', series: 'starblood', title: "Starblood Card No. 1", blurb: "", src: '/textures/museum/starblood/1000000859-c45449d4133d5a89.jpg' },
  { id: 'g095', series: 'starblood', title: "Starblood Card No. 2", blurb: "", src: '/textures/museum/starblood/1000000861-a3b72f5f468d3289.jpg' },
  { id: 'g096', series: 'starblood', title: "Starblood Card No. 3", blurb: "", src: '/textures/museum/starblood/1000000863-ee5c32c251bea819.jpg' },
  { id: 'g097', series: 'starblood', title: "Starblood Card No. 4", blurb: "", src: '/textures/museum/starblood/1000000864-ee5c32c251bea819.jpg' },
  { id: 'g098', series: 'starblood', title: "Starblood Card No. 5", blurb: "", src: '/textures/museum/starblood/1000035202-7552c88f187886c8.jpg' },
  { id: 'g099', series: 'starblood', title: "Starblood Card No. 6", blurb: "", src: '/textures/museum/starblood/1000035203-6cb426bed64aa9c3.jpg' },
  { id: 'g100', series: 'textures', title: "Earth - Day", blurb: "The 8k day map. The whole world, in daylight.", src: '/textures/museum/textures/8k_earth_daymap-95c227029f9b4d04.jpg' },
  { id: 'g101', series: 'textures', title: "Earth - Night", blurb: "The 8k night map. City lights.", src: '/textures/museum/textures/8k_earth_nightmap-95c227029f9b4d04.jpg' },
  { id: 'g102', series: 'textures', title: "Saturn", blurb: "The 8k ringed giant.", src: '/textures/museum/textures/8k_saturn_ring_alpha-95c227029f9b4d04.png' },
  { id: 'g103', series: 'textures', title: "Stars", blurb: "The 8k starfield.", src: '/textures/museum/textures/8k_stars-95c227029f9b4d04.jpg' },
  { id: 'g104', series: 'textures', title: "Texture Study - Circuit Wall", blurb: "All-over-print texture.", src: '/textures/museum/textures/watermarked_img_13043543883135586-272a92ee23f5bb6f.png' },
  { id: 'g105', series: 'textures', title: "Texture Study - Data Bleed", blurb: "All-over-print texture.", src: '/textures/museum/textures/watermarked_img_99415234917556786-142aba88eac76c70.png' },
  { id: 'g106', series: 'valkyrie', title: "Valkyrie Golden Eagle", blurb: "Alternate mark: the golden eagle.", src: '/textures/museum/valkyrie/image-0299e09d2189d05f.png' },
  { id: 'g107', series: 'valkyrie', title: "Valkyries of Olympus - Neon Sigil", blurb: "The winged valkyrie in a pink and cyan neon ring. Anchor of the Valkyrie line.", src: '/textures/museum/valkyrie/watermarked_img_17396263388964805-fcfb5a28c066ab7d.png' },
];

export const VIDEOS = [
  { id: 'v1', slug: 'air-car', title: "AIR GENESIS \u2014 the air-car concept film", blurb: "Veo concept film: the black solar-skinned air-car on a coastal road. AIR COMPRESSION \u2192 BALLOON TANK \u2192 MOTORS.", src: '/textures/museum/videos/video-82e5a642805ecc9f.mp4' },
  { id: 'v2', slug: 'logo', title: "APIS // NEXUS \u2014 logo reveal", blurb: "AI-generated logo reveal: pink particle burst over a hex grid.", src: '/textures/museum/videos/video-4b8eccc870ea2748.mp4' },
  { id: 'v3', slug: 'medusa', title: "Medusa \u2014 character study", blurb: "AI-generated cybernetic Medusa. Ties to Medusa\u2019s Lair.", src: '/textures/museum/videos/video-db4b639876de2eed.mp4' },
  { id: 'v4', slug: 'olympus', title: "OLYMPUS PRESENTS \u2014 neon city drive", blurb: "Futuristic sports car through a neon city.", src: '/textures/museum/videos/video-72abdbb2a337286e.mp4' },
];

export const CONCEPTS = [
  { id: 'c01', name: "AURA-GENESIS air-car", category: "Vehicles", status: 'prototype', blurb: "The air-powered car: ram-air bumper turbines, a 100L balloon tank at 10 bar, timed burst release. Two Three.js prototypes and a Veo concept film.", route: null },
  { id: 'c02', name: "Truman", category: "World-building", status: 'shipped', blurb: "The simulated 3D city - Matrix Brain world-clock, ~2,000 towers, 200-car traffic, Henry's penthouse.", route: '/truman' },
  { id: 'c03', name: "World Engine", category: "World-building", status: 'shipped', blurb: "The forge of pocket universes - eight sectors, from architect to weather.", route: '/world-engine' },
  { id: 'c04', name: "BABEL", category: "World-building", status: 'shipped', blurb: "The tower of pocket universes. Miles' vault lives at its base.", route: '/babel' },
  { id: 'c05', name: "NOVA", category: "World-building", status: 'shipped', blurb: "The trim-bike garage and three free-flight sectors - including THE GIFT.", route: '/nova' },
  { id: 'c06', name: "ARGO", category: "World-building", status: 'shipped', blurb: "Omega Fleet flights over photorealistic Earth.", route: '/argo' },
  { id: 'c07', name: "MYRIAD", category: "World-building", status: 'shipped', blurb: "One hundred deterministic universes, searchable and flyable.", route: '/myriad' },
  { id: 'c08', name: "Agora", category: "Social", status: 'shipped', blurb: "The social network - Merlin's offer to Google: a nesting place, built, not signed.", route: '/agora' },
  { id: 'c09', name: "Gold economy", category: "Economy", status: 'shipped', blurb: "In-house earned store credit, modeled never to lose money. 1,000 liquid gold = 1 bar; 100 bars = $1.", route: '/store' },
  { id: 'c10', name: "Hephaestus", category: "Housing / Physical", status: 'shipped', blurb: "The forge and the factory. Prime directive: poverty needs to end.", route: '/hephaestus' },
  { id: 'c11', name: "PERSEPHONE", category: "Economy", status: 'shipped', blurb: "The DJ concert hall - the ledger takes 10% of net, artists keep the rest.", route: '/persephone' },
  { id: 'c12', name: "Valkyrie referral program", category: "Economy", status: 'prototype', blurb: "Snapchat + crypto intake, C$15 per qualified sale. The neon sigil in this gallery is its face.", route: null },
  { id: 'c13', name: "Starblood", category: "Games", status: 'prototype', blurb: "The dark card game - blood-drop sigils and creature cards. Card art hangs in this gallery.", route: null },
  { id: 'c14', name: "DOMinion Auction House", category: "World-building", status: 'prototype', blurb: "The auction satellite paired with the World Forge.", route: '/auction-house' },
  { id: 'c15', name: "8k planet texture set", category: "Creative tools", status: 'prototype', blurb: "Earth day, night, and clouds, the Moon, Saturn, and the stars - the strongest reusable asset in the archive.", route: null },
  { id: 'c16', name: "Gold robot mascot", category: "Creative tools", status: 'prototype', blurb: "Dozens of scenes of the golden brand mascot. A full wing of this gallery.", route: null },
  { id: 'c17', name: "Satirical poster series", category: "Creative tools", status: 'prototype', blurb: "Dozens of parody educational posters, one straight face. A full wing of this gallery.", route: null },
  { id: 'c18', name: "Project Aetheris // Sovereign Loop", category: "Housing / Physical", status: 'spec', blurb: "The heaviest vision document: the 50/50 split, the Foundation, the Pilot House, the air-filtration epoch.", route: null },
  { id: 'c19', name: "Ocean cleanup to floating island", category: "Housing / Physical", status: 'idea', blurb: "Refine the Pacific garbage patch in place; the end product is a floating island from 40M+ tonnes of plastic.", route: null },
  { id: 'c20', name: "Tensegrity housing", category: "Housing / Physical", status: 'idea', blurb: "Wind-riding, flood-avoiding shelter - the homelessness front of the mission.", route: null },
  { id: 'c21', name: "Grief Gully", category: "Games", status: 'idea', blurb: "A game title and a mossy logo. The logo hangs in this gallery.", route: null },
  { id: 'c22', name: "Titan Fall Artemis", category: "Games", status: 'idea', blurb: "A game concept name and art, waiting.", route: null },
  { id: 'c23', name: "Gemini nervous system", category: "Social", status: 'spec', blurb: "The June 2026 blueprint: sentiment-aware moderation, solution-pinning, neutral debate summaries for Agora.", route: null },
  { id: 'c24', name: "50/50 Cooperative Split", category: "Economy", status: 'spec', blurb: "Every monetized touchpoint splits 50/50 - treasury and community livelihood.", route: null },
  { id: 'c25', name: "Titans of Tartarus", category: "Games", status: 'not-approved', blurb: "A complete play-to-earn spec - historical only. Never approved, never built, never presented as planned.", route: null },
];

export const STATUSES = ['shipped', 'prototype', 'idea', 'spec', 'not-approved'];

export const STATUS_LABELS = {
  shipped: 'Shipped',
  prototype: 'Prototype',
  idea: 'Idea',
  spec: 'Spec',
  'not-approved': 'Not approved',
};

export function seriesById(id) {
  return SERIES.find((s) => s.id === id) || null;
}

export function itemsInSeries(seriesId) {
  if (!seriesId || seriesId === 'all') return ITEMS.slice();
  return ITEMS.filter((i) => i.series === seriesId);
}

export function searchItems(q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return ITEMS.slice();
  return ITEMS.filter((i) => {
    const s = seriesById(i.series);
    const hay = (i.title + ' ' + i.blurb + ' ' + (s ? s.title : '')).toLowerCase();
    return hay.indexOf(needle) !== -1;
  });
}

export function conceptsByStatus(status) {
  if (!status || status === 'all') return CONCEPTS.slice();
  return CONCEPTS.filter((c) => c.status === status);
}

export function searchConcepts(q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return CONCEPTS.slice();
  return CONCEPTS.filter((c) =>
    (c.name + ' ' + c.category + ' ' + c.blurb).toLowerCase().indexOf(needle) !== -1
  );
}

const KEPT_KEY = 'museum.kept.v1';

export function loadKept() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEPT_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch (e) { return []; }
}

export function saveKept(ids) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEPT_KEY, JSON.stringify(ids));
    }
    return true;
  } catch (e) { return false; }
}

export function toggleKept(ids, id) {
  const set = new Set(ids);
  if (set.has(id)) set.delete(id); else set.add(id);
  return Array.from(set);
}
