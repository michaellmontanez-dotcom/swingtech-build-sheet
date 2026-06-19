// Standard US-edition Monopoly board, card decks, and group metadata.
// Bundled as constant tables imported by logic.ts.

export type SpaceType =
  | "go"
  | "street"
  | "railroad"
  | "utility"
  | "tax"
  | "chance"
  | "chest"
  | "jail" // Just Visiting / In Jail
  | "freeParking"
  | "goToJail";

export type ColorGroup =
  | "brown"
  | "lightblue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "darkblue"
  | "railroad"
  | "utility";

export interface BoardSpace {
  index: number; // 0..39
  name: string;
  type: SpaceType;
  group?: ColorGroup;
  price?: number; // purchase price for streets/railroads/utilities
  // rent[0] = base (unimproved), rent[1..4] = 1..4 houses, rent[5] = hotel
  // (streets only). Railroad/utility rent computed specially.
  rent?: number[];
  houseCost?: number; // cost to add one house/hotel (per group)
  taxAmount?: number; // for tax spaces
}

// House cost per color group (standard rules).
export const HOUSE_COST: Record<string, number> = {
  brown: 50,
  lightblue: 50,
  pink: 100,
  orange: 100,
  red: 150,
  yellow: 150,
  green: 200,
  darkblue: 200,
};

// Number of streets that make a full monopoly of each color group.
export const GROUP_SIZE: Record<string, number> = {
  brown: 2,
  lightblue: 3,
  pink: 3,
  orange: 3,
  red: 3,
  yellow: 3,
  green: 3,
  darkblue: 2,
};

// Railroad rent by number of railroads owned (1..4).
export const RAILROAD_RENT = [0, 25, 50, 100, 200];

export const BOARD: BoardSpace[] = [
  { index: 0, name: "GO", type: "go" },
  {
    index: 1,
    name: "Mediterranean Avenue",
    type: "street",
    group: "brown",
    price: 60,
    rent: [2, 10, 30, 90, 160, 250],
    houseCost: 50,
  },
  { index: 2, name: "Community Chest", type: "chest" },
  {
    index: 3,
    name: "Baltic Avenue",
    type: "street",
    group: "brown",
    price: 60,
    rent: [4, 20, 60, 180, 320, 450],
    houseCost: 50,
  },
  { index: 4, name: "Income Tax", type: "tax", taxAmount: 200 },
  {
    index: 5,
    name: "Reading Railroad",
    type: "railroad",
    group: "railroad",
    price: 200,
  },
  {
    index: 6,
    name: "Oriental Avenue",
    type: "street",
    group: "lightblue",
    price: 100,
    rent: [6, 30, 90, 270, 400, 550],
    houseCost: 50,
  },
  { index: 7, name: "Chance", type: "chance" },
  {
    index: 8,
    name: "Vermont Avenue",
    type: "street",
    group: "lightblue",
    price: 100,
    rent: [6, 30, 90, 270, 400, 550],
    houseCost: 50,
  },
  {
    index: 9,
    name: "Connecticut Avenue",
    type: "street",
    group: "lightblue",
    price: 120,
    rent: [8, 40, 100, 300, 450, 600],
    houseCost: 50,
  },
  { index: 10, name: "Jail / Just Visiting", type: "jail" },
  {
    index: 11,
    name: "St. Charles Place",
    type: "street",
    group: "pink",
    price: 140,
    rent: [10, 50, 150, 450, 625, 750],
    houseCost: 100,
  },
  {
    index: 12,
    name: "Electric Company",
    type: "utility",
    group: "utility",
    price: 150,
  },
  {
    index: 13,
    name: "States Avenue",
    type: "street",
    group: "pink",
    price: 140,
    rent: [10, 50, 150, 450, 625, 750],
    houseCost: 100,
  },
  {
    index: 14,
    name: "Virginia Avenue",
    type: "street",
    group: "pink",
    price: 160,
    rent: [12, 60, 180, 500, 700, 900],
    houseCost: 100,
  },
  {
    index: 15,
    name: "Pennsylvania Railroad",
    type: "railroad",
    group: "railroad",
    price: 200,
  },
  {
    index: 16,
    name: "St. James Place",
    type: "street",
    group: "orange",
    price: 180,
    rent: [14, 70, 200, 550, 750, 950],
    houseCost: 100,
  },
  { index: 17, name: "Community Chest", type: "chest" },
  {
    index: 18,
    name: "Tennessee Avenue",
    type: "street",
    group: "orange",
    price: 180,
    rent: [14, 70, 200, 550, 750, 950],
    houseCost: 100,
  },
  {
    index: 19,
    name: "New York Avenue",
    type: "street",
    group: "orange",
    price: 200,
    rent: [16, 80, 220, 600, 800, 1000],
    houseCost: 100,
  },
  { index: 20, name: "Free Parking", type: "freeParking" },
  {
    index: 21,
    name: "Kentucky Avenue",
    type: "street",
    group: "red",
    price: 220,
    rent: [18, 90, 250, 700, 875, 1050],
    houseCost: 150,
  },
  { index: 22, name: "Chance", type: "chance" },
  {
    index: 23,
    name: "Indiana Avenue",
    type: "street",
    group: "red",
    price: 220,
    rent: [18, 90, 250, 700, 875, 1050],
    houseCost: 150,
  },
  {
    index: 24,
    name: "Illinois Avenue",
    type: "street",
    group: "red",
    price: 240,
    rent: [20, 100, 300, 750, 925, 1100],
    houseCost: 150,
  },
  {
    index: 25,
    name: "B&O Railroad",
    type: "railroad",
    group: "railroad",
    price: 200,
  },
  {
    index: 26,
    name: "Atlantic Avenue",
    type: "street",
    group: "yellow",
    price: 260,
    rent: [22, 110, 330, 800, 975, 1150],
    houseCost: 150,
  },
  {
    index: 27,
    name: "Ventnor Avenue",
    type: "street",
    group: "yellow",
    price: 260,
    rent: [22, 110, 330, 800, 975, 1150],
    houseCost: 150,
  },
  {
    index: 28,
    name: "Water Works",
    type: "utility",
    group: "utility",
    price: 150,
  },
  {
    index: 29,
    name: "Marvin Gardens",
    type: "street",
    group: "yellow",
    price: 280,
    rent: [24, 120, 360, 850, 1025, 1200],
    houseCost: 150,
  },
  { index: 30, name: "Go To Jail", type: "goToJail" },
  {
    index: 31,
    name: "Pacific Avenue",
    type: "street",
    group: "green",
    price: 300,
    rent: [26, 130, 390, 900, 1100, 1275],
    houseCost: 200,
  },
  {
    index: 32,
    name: "North Carolina Avenue",
    type: "street",
    group: "green",
    price: 300,
    rent: [26, 130, 390, 900, 1100, 1275],
    houseCost: 200,
  },
  { index: 33, name: "Community Chest", type: "chest" },
  {
    index: 34,
    name: "Pennsylvania Avenue",
    type: "street",
    group: "green",
    price: 320,
    rent: [28, 150, 450, 1000, 1200, 1400],
    houseCost: 200,
  },
  {
    index: 35,
    name: "Short Line",
    type: "railroad",
    group: "railroad",
    price: 200,
  },
  { index: 36, name: "Chance", type: "chance" },
  {
    index: 37,
    name: "Park Place",
    type: "street",
    group: "darkblue",
    price: 350,
    rent: [35, 175, 500, 1100, 1300, 1500],
    houseCost: 200,
  },
  { index: 38, name: "Luxury Tax", type: "tax", taxAmount: 100 },
  {
    index: 39,
    name: "Boardwalk",
    type: "street",
    group: "darkblue",
    price: 400,
    rent: [50, 200, 600, 1400, 1700, 2000],
    houseCost: 200,
  },
];

export const JAIL_INDEX = 10;
export const GO_TO_JAIL_INDEX = 30;
export const GO_SALARY = 200;

// ----------------------------------------------------------------------------
// Card decks (Chance & Community Chest). Standard US edition.
// `action` discriminates the effect; logic.ts resolves it.
// ----------------------------------------------------------------------------
export type CardAction =
  | { kind: "advanceTo"; index: number; collectGoIfPassed?: boolean } // move forward (collect GO if passed)
  | { kind: "advanceToNearest"; group: "railroad" | "utility" } // special rent multipliers
  | { kind: "move"; spaces: number } // relative move (e.g. back 3)
  | { kind: "collect"; amount: number }
  | { kind: "pay"; amount: number }
  | { kind: "payEachPlayer"; amount: number }
  | { kind: "collectEachPlayer"; amount: number }
  | { kind: "goToJail" }
  | { kind: "getOutOfJailFree" }
  | { kind: "repairs"; perHouse: number; perHotel: number };

export interface DeckCard {
  id: string;
  text: string;
  action: CardAction;
}

export const CHANCE_CARDS: DeckCard[] = [
  { id: "ch1", text: "Advance to GO (Collect $200)", action: { kind: "advanceTo", index: 0 } },
  { id: "ch2", text: "Advance to Illinois Avenue", action: { kind: "advanceTo", index: 24, collectGoIfPassed: true } },
  { id: "ch3", text: "Advance to St. Charles Place", action: { kind: "advanceTo", index: 11, collectGoIfPassed: true } },
  { id: "ch4", text: "Advance to nearest Utility", action: { kind: "advanceToNearest", group: "utility" } },
  { id: "ch5", text: "Advance to nearest Railroad", action: { kind: "advanceToNearest", group: "railroad" } },
  { id: "ch6", text: "Bank pays you dividend of $50", action: { kind: "collect", amount: 50 } },
  { id: "ch7", text: "Get Out of Jail Free", action: { kind: "getOutOfJailFree" } },
  { id: "ch8", text: "Go Back 3 Spaces", action: { kind: "move", spaces: -3 } },
  { id: "ch9", text: "Go to Jail. Do not pass GO", action: { kind: "goToJail" } },
  {
    id: "ch10",
    text: "Make general repairs: $25 per house, $100 per hotel",
    action: { kind: "repairs", perHouse: 25, perHotel: 100 },
  },
  { id: "ch11", text: "Speeding fine $15", action: { kind: "pay", amount: 15 } },
  { id: "ch12", text: "Advance to Reading Railroad", action: { kind: "advanceTo", index: 5, collectGoIfPassed: true } },
  { id: "ch13", text: "Advance to Boardwalk", action: { kind: "advanceTo", index: 39, collectGoIfPassed: true } },
  { id: "ch14", text: "Pay each player $50 (elected chairman)", action: { kind: "payEachPlayer", amount: 50 } },
  { id: "ch15", text: "Building loan matures. Collect $150", action: { kind: "collect", amount: 150 } },
];

export const CHEST_CARDS: DeckCard[] = [
  { id: "cc1", text: "Advance to GO (Collect $200)", action: { kind: "advanceTo", index: 0 } },
  { id: "cc2", text: "Bank error in your favor. Collect $200", action: { kind: "collect", amount: 200 } },
  { id: "cc3", text: "Doctor's fee. Pay $50", action: { kind: "pay", amount: 50 } },
  { id: "cc4", text: "From sale of stock you get $50", action: { kind: "collect", amount: 50 } },
  { id: "cc5", text: "Get Out of Jail Free", action: { kind: "getOutOfJailFree" } },
  { id: "cc6", text: "Go to Jail. Do not pass GO", action: { kind: "goToJail" } },
  { id: "cc7", text: "Holiday fund matures. Receive $100", action: { kind: "collect", amount: 100 } },
  { id: "cc8", text: "Income tax refund. Collect $20", action: { kind: "collect", amount: 20 } },
  { id: "cc9", text: "It is your birthday. Collect $10 from every player", action: { kind: "collectEachPlayer", amount: 10 } },
  { id: "cc10", text: "Life insurance matures. Collect $100", action: { kind: "collect", amount: 100 } },
  { id: "cc11", text: "Pay hospital fees of $100", action: { kind: "pay", amount: 100 } },
  { id: "cc12", text: "Pay school fees of $50", action: { kind: "pay", amount: 50 } },
  { id: "cc13", text: "Receive $25 consultancy fee", action: { kind: "collect", amount: 25 } },
  {
    id: "cc14",
    text: "You are assessed for street repairs: $40 per house, $115 per hotel",
    action: { kind: "repairs", perHouse: 40, perHotel: 115 },
  },
  { id: "cc15", text: "You have won second prize in a beauty contest. Collect $10", action: { kind: "collect", amount: 10 } },
  { id: "cc16", text: "You inherit $100", action: { kind: "collect", amount: 100 } },
];
