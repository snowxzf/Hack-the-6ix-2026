/** Demo Learn posts: original summaries synthesized from cited public sources
 *  (Wikipedia, university extensions, RHS, EPA, etc.). Not verbatim copies. Images via Unsplash. */

export type BlogTier = "beginner" | "intermediate" | "advanced";

export interface BlogSource {
  label: string;
  url: string;
}

export interface BlogPost {
  id: string;
  tier: BlogTier;
  title: string;
  blurb: string;
  mins: number;
  image: string;
  imageAlt: string;
  credit: string;
  lead: string;
  sections: { heading: string; body: string }[];
  tips: string[];
  /** Public references this demo summary draws on. */
  sources: BlogSource[];
}

const u = (id: string, w = 900) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const wiki = (slug: string, label: string): BlogSource => ({
  label,
  url: `https://en.wikipedia.org/wiki/${slug}`,
});

export const BLOG_POSTS: BlogPost[] = [
  {
    id: "first-tomato",
    tier: "beginner",
    title: "Starting your first tomato",
    blurb: "From seed to first fruit in a sunny spot.",
    mins: 5,
    image: u("photo-1592924357228-91a4daadcfea"),
    imageAlt: "Ripe red tomatoes on the vine",
    credit: "Unsplash",
    lead:
      "Tomatoes are the classic first crop for a reason: they reward patience with fruit you can taste the difference in. A sunny balcony pot or a raised bed both work: the plant cares more about light and water than about fancy gear.",
    sections: [
      {
        heading: "Pick the right plant",
        body:
          "Cherry and determinate (bush) types are forgiving in small spaces. Indeterminate vines keep growing and fruiting all season but need a sturdy stake or cage. Start seedlings indoors 6-8 weeks before your last frost, or buy sturdy transplants with dark green leaves and no flowers yet.",
      },
      {
        heading: "Sun, soil, and spacing",
        body:
          "Aim for at least 6-8 hours of direct sun. Plant deep: strip lower leaves and bury the stem; tomatoes grow roots along buried stems and become sturdier. Give each plant roughly 45-60 cm of space, and mulch to keep soil moisture even.",
      },
      {
        heading: "Water and first fruit",
        body:
          "Water deeply at the base when the top few centimetres of soil feel dry: irregular watering is a common cause of blossom-end rot and cracked fruit. Once flowers appear, a light weekly feed of a tomato-friendly fertilizer helps. Harvest when fruit yields slightly to a gentle squeeze and smells sweet.",
      },
    ],
    tips: [
      "Plant a marigold nearby: it looks cheerful and can deter some pests.",
      "Never water leaves late in the day; wet foliage overnight invites disease.",
      "If nights are still cold, cover young plants with a cloche or old jar.",
    ],
    sources: [
      wiki("Tomato", "Wikipedia: Tomato"),
      {
        label: "RHS: Growing tomatoes",
        url: "https://www.rhs.org.uk/vegetables/tomatoes/grow-your-own",
      },
      {
        label: "Cornell: Growing guide for the home garden: Tomato",
        url: "https://www.gardening.cornell.edu/homegardening/scene0391.html",
      },
    ],
  },
  {
    id: "how-often-water",
    tier: "beginner",
    title: "How often should I water?",
    blurb: "Read the soil, not the calendar.",
    mins: 4,
    image: u("photo-1416879595882-3373a0480b5b"),
    imageAlt: "Gardener watering plants with a watering can",
    credit: "Unsplash",
    lead:
      "There is no universal schedule. Soil type, pot size, weather, and plant stage all change how fast water disappears. Learning to check moisture is the skill that prevents both wilted plants and root rot.",
    sections: [
      {
        heading: "The finger test",
        body:
          "Push a finger into the soil up to the second knuckle. If it feels dry at that depth, water. If it is cool and damp, wait. For pots, lift the container: a light pot usually needs water; a heavy one can wait.",
      },
      {
        heading: "Deep and infrequent beats daily sips",
        body:
          "Shallow daily watering trains roots to stay near the surface. Water until moisture reaches the root zone, then let the top layer dry slightly. In heat waves you may water daily; in cool cloudy weeks, much less.",
      },
      {
        heading: "Morning is kinder",
        body:
          "Watering early reduces evaporation and lets leaves dry before night. Mulch (straw, shredded leaves, or wood chips) can cut watering needs by half by shading the soil and slowing evaporation.",
      },
    ],
    tips: [
      "Rain does not always soak pots under eaves: check containers after storms.",
      "Wilting at noon can be temporary heat stress; check again in the evening before watering.",
      "Self-watering pots help herbs and tomatoes on balconies.",
    ],
    sources: [
      wiki("Irrigation", "Wikipedia: Irrigation"),
      wiki("Mulch", "Wikipedia: Mulch"),
      {
        label: "RHS: Watering",
        url: "https://www.rhs.org.uk/garden-jobs/watering",
      },
      {
        label: "UC ANR: Watering tips for efficient irrigation",
        url: "https://ucanr.edu/site/uc-master-gardeners-riverside-county/article/watering-tips-efficient-irrigation",
      },
    ],
  },
  {
    id: "windowsill-herbs",
    tier: "beginner",
    title: "5 herbs for a windowsill",
    blurb: "Basil, mint, chives and more: no garden needed.",
    mins: 5,
    image: u("photo-1516253593875-bd7ba052fbc5"),
    imageAlt: "Fresh herbs growing in pots on a sunny windowsill",
    credit: "Unsplash",
    lead:
      "A bright kitchen window can grow enough herbs to change everyday cooking. Start with five reliable picks, give them drainage, and snip often: harvesting is what keeps them bushy.",
    sections: [
      {
        heading: "The core five",
        body:
          "Basil loves warmth and sun: pinch tips to delay flowering. Mint is vigorous (keep it in its own pot). Chives bounce back after every cut. Parsley is slower but steady in cooler light. Thyme prefers slightly drier soil and thrives in a shallow pot.",
      },
      {
        heading: "Pots and light",
        body:
          "Use containers with drainage holes and a light potting mix: never garden soil alone in pots. South- or west-facing windows are ideal; rotate pots weekly so stems grow straight. If light is weak in winter, a small LED grow bulb helps basil especially.",
      },
      {
        heading: "Harvest like a cook",
        body:
          "Take leaves from the top, not the bottom, so plants branch. Never strip more than a third of the plant at once. Rinse and dry herbs before storing; soft herbs like basil bruise less when torn by hand at the last minute.",
      },
    ],
    tips: [
      "Mint and oregano spread: separate pots prevent a windowsill takeover.",
      "Yellow lower leaves often mean overwatering or tired soil: refresh the mix.",
      "Pair a herb pot with a saucer so your sill stays clean.",
    ],
    sources: [
      wiki("Basil", "Wikipedia: Basil"),
      wiki("Mentha", "Wikipedia: Mint (Mentha)"),
      {
        label: "RHS: Growing herbs",
        url: "https://www.rhs.org.uk/vegetables/herbs",
      },
      {
        label: "University of Minnesota Extension: Growing herbs indoors",
        url: "https://extension.umn.edu/yard-and-garden-news/growing-herbs-indoors",
      },
    ],
  },
  {
    id: "understanding-sunlight",
    tier: "beginner",
    title: "Understanding sunlight",
    blurb: "Full sun, partial shade, and what it means.",
    mins: 4,
    image: u("photo-1471193945509-9ad0617afabf"),
    imageAlt: "Vegetable garden beds in bright sunlight",
    credit: "Unsplash",
    lead:
      "Seed packets speak a language of light. Knowing what “full sun” and “partial shade” actually mean on your balcony or yard is half the battle of matching plants to places.",
    sections: [
      {
        heading: "The common labels",
        body:
          "Full sun usually means 6+ hours of direct sun. Partial sun / partial shade is roughly 3-6 hours, often morning sun with afternoon shade. Full shade is under 3 hours of direct sun: think north walls or deep courtyards. Dappled light under trees counts as partial shade for many greens.",
      },
      {
        heading: "Map your space",
        body:
          "Watch one clear day: note where sun hits at 9 a.m., noon, and 3 p.m. Balconies often get intense reflected heat from walls even when hours look short. Heat-loving crops (tomatoes, peppers, squash) want the brightest spots; lettuce and spinach bolt less with afternoon shade.",
      },
      {
        heading: "When light is scarce",
        body:
          "Choose compact greens, chives, mint, and ferns for shadier corners. Reflective mulch or a light-coloured wall can bounce a little extra light. If you only have one sunny spot, rotate pots seasonally so fruiting plants get first claim in summer.",
      },
    ],
    tips: [
      "Morning sun is gentler; harsh western afternoon sun can scorch tender leaves.",
      "Cloud cover still provides useful light for leafy crops.",
      "Seedlings that lean hard one way are telling you they need more (or more even) light.",
    ],
    sources: [
      wiki("Shade_(shadow)", "Wikipedia: Shade"),
      {
        label: "RHS: Understanding light levels",
        url: "https://www.rhs.org.uk/plants/types/trees/planting/light-levels",
      },
      {
        label: "Penn State Extension: Sun and shade for vegetables",
        url: "https://extension.psu.edu/sun-and-shade-requirements-for-vegetables",
      },
    ],
  },
  {
    id: "companion-planting",
    tier: "intermediate",
    title: "Companion planting basics",
    blurb: "Pair crops that help each other thrive.",
    mins: 7,
    image: u("photo-1591857177580-dc82b9ac4e1e"),
    imageAlt: "Diverse vegetables growing together in a garden bed",
    credit: "Unsplash",
    lead:
      "Companion planting is an old idea with modern appeal: mix plants so they share space, confuse pests, or feed the soil. Not every folklore pairing is proven, but a few classics are worth building a bed around.",
    sections: [
      {
        heading: "The Three Sisters idea",
        body:
          "Indigenous growers across the Americas long paired corn, beans, and squash. Corn offers a pole for beans; beans fix nitrogen; squash leaves shade soil and suppress weeds. Even in a small plot, tall + climbing + sprawling layers make efficient use of sun and space.",
      },
      {
        heading: "Pairs that often help",
        body:
          "Tomatoes with basil or marigold is a popular kitchen-garden combo. Carrots and onions can confuse carrot fly and onion fly when interplanted. Tall sunflowers can shelter lettuce from harsh afternoon sun. Avoid crowding: companions still need airflow to stay healthy.",
      },
      {
        heading: "What to keep apart",
        body:
          "Fennel can inhibit nearby plants. Potatoes and tomatoes share disease pressures, so rotate them away from each other year after year. Heavy feeders side-by-side (corn next to broccoli) may compete unless you feed the soil well.",
      },
    ],
    tips: [
      "Think in layers: roots, leaves, and flowers at different heights.",
      "Flowers like calendula and alyssum attract beneficial insects.",
      "Keep a simple notebook of what thrived together in your microclimate.",
    ],
    sources: [
      wiki("Companion_planting", "Wikipedia: Companion planting"),
      wiki("Three_Sisters_(agriculture)", "Wikipedia: Three Sisters (agriculture)"),
      {
        label: "Native Seeds/SEARCH: Three Sisters",
        url: "https://www.nativeseeds.org/blogs/blog-news/how-to-grow-a-three-sisters-garden",
      },
      {
        label: "RHS: Companion planting",
        url: "https://www.rhs.org.uk/prevention-protection/companion-planting",
      },
    ],
  },
  {
    id: "composting",
    tier: "intermediate",
    title: "Composting to cut food waste",
    blurb: "Turn kitchen scraps into garden gold.",
    mins: 7,
    image: u("photo-1464226184884-fa280b87c399"),
    imageAlt: "Hands holding dark finished compost",
    credit: "Unsplash",
    lead:
      "Composting closes the loop between kitchen and garden. Microbes break down scraps into humus-rich material that feeds soil life, holds water, and reduces what goes to landfill: a small climate win with big plant payoffs.",
    sections: [
      {
        heading: "Greens and browns",
        body:
          "Balance nitrogen-rich “greens” (fruit and veg scraps, coffee grounds, fresh grass) with carbon-rich “browns” (dry leaves, shredded cardboard, straw). Roughly equal volumes by bulk works for beginners. Chop scraps small so they break down faster.",
      },
      {
        heading: "What to skip",
        body:
          "Avoid meat, dairy, oily foods, and pet waste in a simple home pile: they attract pests and smell. Diseased plants and invasive weeds with seeds are better left out. Citrus and onions are fine in moderation once your pile is active.",
      },
      {
        heading: "When it’s ready",
        body:
          "Finished compost is dark, crumbly, and earthy-smelling: you should not recognize yesterday’s banana peel. Screen out woody bits and mix compost into beds or use it as a top dressing. Bokashi or worm bins work well for apartments without a yard.",
      },
    ],
    tips: [
      "If the pile smells, add browns and turn it for air.",
      "If nothing is happening, add greens and a splash of water: piles should feel like a wrung-out sponge.",
      "City programs often accept scraps if you cannot compost at home.",
    ],
    sources: [
      wiki("Compost", "Wikipedia: Compost"),
      {
        label: "US EPA: Composting at home",
        url: "https://www.epa.gov/recycle/composting-home",
      },
      {
        label: "City of Toronto: Composting",
        url: "https://www.toronto.ca/services-payments/recycling-organics-garbage/composting/",
      },
    ],
  },
  {
    id: "healthy-soil",
    tier: "intermediate",
    title: "Building healthy soil",
    blurb: "Crop rotation and organic matter.",
    mins: 8,
    image: u("photo-1625246333195-78d9c38ad449"),
    imageAlt: "Gardener working rich soil in a raised bed",
    credit: "Unsplash",
    lead:
      "Healthy soil is alive: fungi, bacteria, worms, and roots trading nutrients in a web you rarely see. Feeding that web with organic matter beats chasing perfect NPK numbers alone.",
    sections: [
      {
        heading: "Organic matter first",
        body:
          "Compost, leaf mold, and well-rotted manure improve structure in both clay and sand. Clay drains better; sand holds more water and nutrients. Aim to top-dress beds each season rather than tilling deeply every year: undisturbed soil keeps fungal networks intact.",
      },
      {
        heading: "Simple crop rotation",
        body:
          "Rotate plant families so the same crop does not occupy the same spot year after year. A four-bed sketch works: legumes (beans, peas) → leafy greens → fruiting crops (tomato family) → roots. Rotation reduces nutrient mining and breaks pest and disease cycles.",
      },
      {
        heading: "Cover and protect",
        body:
          "Bare soil erodes and loses biology. Cover crops (clover, winter rye) or mulch protect the surface. In pots, refresh the top third of mix each spring and avoid packing soil rock-hard when watering.",
      },
    ],
    tips: [
      "A handful of soil should smell earthy, not sour.",
      "Earthworms are a good sign: avoid harsh chemical salts that drive them away.",
      "Test kits give a rough pH; most veggies like roughly 6.0-7.0.",
    ],
    sources: [
      wiki("Soil", "Wikipedia: Soil"),
      wiki("Crop_rotation", "Wikipedia: Crop rotation"),
      {
        label: "FAO: Soil organic carbon",
        url: "https://www.fao.org/soils-portal/soil-management/soil-carbon-sequestration/en/",
      },
      {
        label: "OMAFRA: Soil management",
        url: "https://www.ontario.ca/page/soil-management",
      },
    ],
  },
  {
    id: "pest-control",
    tier: "intermediate",
    title: "Pest control without chemicals",
    blurb: "Natural defenses for a healthier garden.",
    mins: 6,
    image: u("photo-1446071103084-c257b5f70672"),
    imageAlt: "Close-up of a beneficial insect on a green leaf",
    credit: "Unsplash",
    lead:
      "Most gardens host pests and allies at once. The goal is balance, not sterilization. Start with observation, physical barriers, and habitat for predators before reaching for sprays: even organic ones.",
    sections: [
      {
        heading: "Identify before you treat",
        body:
          "Chewed leaves at night often mean slugs or caterpillars; sticky leaves can mean aphids. A quick photo and a field guide (or your PlotTwist search) beat guessing. Many “pests” are temporary; plants outgrow light damage.",
      },
      {
        heading: "Barriers and hand-picking",
        body:
          "Row covers exclude cabbage moths. Copper tape or beer traps help with slugs. Hand-pick tomato hornworms at dusk. A strong spray of water can knock aphids off tender tips: repeat a few days in a row.",
      },
      {
        heading: "Invite the good bugs",
        body:
          "Ladybugs, lacewings, and hoverflies eat soft-bodied pests. Plant dill, fennel flowers, alyssum, and native wildflowers to feed adults. Avoid broad-spectrum insecticides that kill predators along with pests.",
      },
    ],
    tips: [
      "Neem or insecticidal soap can help in outbreaks: spray in evening and follow label rates.",
      "Healthy, well-watered plants resist pests better than stressed ones.",
      "Clean up diseased leaves; do not compost them in a cold pile.",
    ],
    sources: [
      wiki("Integrated_pest_management", "Wikipedia: Integrated pest management"),
      wiki("Biological_pest_control", "Wikipedia: Biological pest control"),
      {
        label: "RHS: Biological control",
        url: "https://www.rhs.org.uk/prevention-protection/biological-control",
      },
      {
        label: "UC IPM: Home, garden, turf and landscape pests",
        url: "https://ipm.ucanr.edu/PMG/menu.homegarden.html",
      },
    ],
  },
  {
    id: "season-extension",
    tier: "advanced",
    title: "Year-round growing with season extension",
    blurb: "Cold frames, row covers, and microclimates.",
    mins: 10,
    image: u("photo-1585320806297-9794b3e4eeae"),
    imageAlt: "Lush plants growing inside a greenhouse",
    credit: "Unsplash",
    lead:
      "Season extension stretches harvests beyond frost dates without a full heated greenhouse. Microclimates: south walls, raised beds, and simple covers: can add weeks of growing in a cool climate like Toronto’s.",
    sections: [
      {
        heading: "Cold frames and cloches",
        body:
          "A cold frame is a bottomless box with a clear lid that traps solar heat. Open it on sunny days so plants do not cook; close it before night. Cloches (jars, plastic bottles, or glass bells) protect individual seedlings in spring and fall.",
      },
      {
        heading: "Row covers and low tunnels",
        body:
          "Lightweight fabric over hoops shelters greens from frost and wind while letting rain through. Heavier covers buy more degrees of protection but need good anchoring. Low tunnels of clear plastic warm soil earlier for spring brassicas and lettuce.",
      },
      {
        heading: "Choose crops for the shoulder seasons",
        body:
          "Spinach, kale, mâche, and carrots handle cool weather better than basil or peppers. Start fall crops in late summer so they size up before short days. In winter, focus on hardy greens under cover rather than forcing summer crops.",
      },
    ],
    tips: [
      "South-facing brick walls radiate heat at night: plant tender crops nearby.",
      "Ventilation prevents fungal disease inside any cover.",
      "Track first and last frost dates for your neighbourhood, not just the city average.",
    ],
    sources: [
      wiki("Cold_frame", "Wikipedia: Cold frame"),
      wiki("Season_extension", "Wikipedia: Season extension"),
      {
        label: "Cornell: Season extension techniques",
        url: "https://www.gardening.cornell.edu/factsheets/ecogardening/seasonextension.html",
      },
      {
        label: "RHS: Protecting plants from cold",
        url: "https://www.rhs.org.uk/garden-jobs/protecting-plants-from-cold",
      },
    ],
  },
  {
    id: "saving-seeds",
    tier: "advanced",
    title: "Saving your own seeds",
    blurb: "Build a resilient, self-sustaining garden.",
    mins: 12,
    image: u("photo-1615485290382-441e4d049cb5"),
    imageAlt: "Seeds and soil ready for planting",
    credit: "Unsplash",
    lead:
      "Saving seed connects this year’s harvest to next year’s planting and preserves varieties that thrive in your exact conditions. Start with easy open-pollinated crops before tackling trickier hybrids or biennials.",
    sections: [
      {
        heading: "Open-pollinated vs hybrid",
        body:
          "Open-pollinated (including heirloom) varieties breed true if isolated properly. Hybrids (often labelled F1) may not produce offspring like the parent. Read the packet: if you want to save seed, choose OP varieties of beans, peas, tomatoes, and lettuce first.",
      },
      {
        heading: "Easy wins: beans and tomatoes",
        body:
          "Let bean pods dry on the plant until brittle, then shell and store cool and dry. For tomatoes, ferment scooped seeds in a jar with a little water for a few days, rinse, and dry on a plate: fermentation removes the gel coat and reduces some pathogens.",
      },
      {
        heading: "Storage and viability",
        body:
          "Label with variety and year. Keep seeds in airtight containers with a desiccant, away from heat and light. Most vegetable seeds stay viable 2-5 years; test a few on a damp paper towel before sowing a large bed.",
      },
    ],
    tips: [
      "Save from your healthiest plants, not the first fruit alone.",
      "Avoid saving from diseased plants.",
      "Cross-pollination matters for squash and corn: isolate or hand-pollinate if purity matters.",
    ],
    sources: [
      wiki("Seed_saving", "Wikipedia: Seed saving"),
      wiki("Open_pollination", "Wikipedia: Open pollination"),
      {
        label: "Seed Savers Exchange: Seed saving resources",
        url: "https://www.seedsavers.org/learn#seed-saving",
      },
      {
        label: "International Seed Saving Institute: How to save seeds",
        url: "https://www.seedsave.org/pages/seed-saving-resources",
      },
    ],
  },
  {
    id: "permaculture-guild",
    tier: "advanced",
    title: "Designing a permaculture guild",
    blurb: "Multi-layer planting for maximum yield.",
    mins: 14,
    image: u("photo-1518531933037-91b2f5f229cc"),
    imageAlt: "Layered garden planting with diverse plants",
    credit: "Unsplash",
    lead:
      "A plant guild stacks functions the way a forest stacks layers: canopy, understory, shrubs, herbs, groundcover, roots, and vines. You design a small ecosystem so plants feed soil, attract pollinators, and produce food with less constant intervention.",
    sections: [
      {
        heading: "Start with a central element",
        body:
          "Often a fruit tree or berry bush anchors the guild. Around it, place nitrogen-fixers (clover, lupine, Siberian pea shrub), dynamic accumulators (comfrey, yarrow) whose deep roots mine minerals, and pest-confusers or insectaries (dill, calendula).",
      },
      {
        heading: "Stack in space and time",
        body:
          "Use vertical space with vines on the sunny side. Groundcovers suppress weeds and keep soil cool. Think seasonally: early bulbs, then summer herbs, then fall fruit. In a balcony version, a dwarf fruit tree in a large pot with underplanted herbs is a mini-guild.",
      },
      {
        heading: "Observe and tweak",
        body:
          "Permaculture emphasizes observation. Sketch sun, wind, and water flow before planting. After a season, note what shaded whom and what thrived. Guilds evolve: remove plants that bully neighbours and double down on what supports the whole.",
      },
    ],
    tips: [
      "Mulch heavily the first years while roots establish.",
      "Comfrey is powerful but spreads: plant where you can manage it.",
      "Even three complementary plants beat a lonely specimen in bare soil.",
    ],
    sources: [
      wiki("Permaculture", "Wikipedia: Permaculture"),
      wiki("Forest_gardening", "Wikipedia: Forest gardening"),
      {
        label: "Permaculture Research Institute: Guilds",
        url: "https://www.permaculturenews.org/2012/11/06/plant-guilds/",
      },
    ],
  },
  {
    id: "drip-irrigation",
    tier: "advanced",
    title: "Water-wise drip irrigation",
    blurb: "Precision watering that saves resources.",
    mins: 9,
    image: u("photo-1574943320219-553eb213f72d"),
    imageAlt: "Garden beds that benefit from efficient watering",
    credit: "Unsplash",
    lead:
      "Drip irrigation delivers water slowly at the root zone, cutting waste from evaporation and runoff. For raised beds and rows of tomatoes, a simple drip line plus a timer can free you from daily hose duty while plants stay more evenly watered.",
    sections: [
      {
        heading: "Why drip beats overhead",
        body:
          "Sprinklers wet leaves and paths; drip keeps foliage dry and puts litres where roots are. That means fewer fungal issues and less water lost to wind. In drought-prone summers, drip is one of the highest-impact efficiency upgrades a garden can make.",
      },
      {
        heading: "A basic layout",
        body:
          "Start with a filter and pressure reducer on a hose bib, then mainline tubing along the bed edge. Branch ½-inch drip line or emitter tubing beside each plant row. Emitters rated 1-2 litres per hour suit most veggies; place one or two near each tomato.",
      },
      {
        heading: "Timers and tuning",
        body:
          "Run short cycles that wet the root zone without puddling: often 20-45 minutes a few times a week, adjusted for heat and soil. Check emitters monthly for clogs. Combine drip with mulch for maximum savings. On balconies, micro-drip kits for containers work on the same idea.",
      },
    ],
    tips: [
      "Flush lines at the start of the season.",
      "Group plants with similar water needs on the same zone.",
      "Rain sensors or a soil-moisture habit prevent watering during wet weeks.",
    ],
    sources: [
      wiki("Drip_irrigation", "Wikipedia: Drip irrigation"),
      {
        label: "US EPA: WaterSense outdoor tips",
        url: "https://www.epa.gov/watersense/outdoor",
      },
      {
        label: "UC ANR: Drip irrigation for the home garden",
        url: "https://ucanr.edu/sites/UrbanHort/files/80184.pdf",
      },
    ],
  },
];

export function postsForTier(tier: BlogTier): BlogPost[] {
  return BLOG_POSTS.filter((p) => p.tier === tier);
}

export function postById(id: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.id === id);
}
