// Turf Tycoon — shared board, cards and token data.
// Loaded by the server (require) and the browser (<script>), so keep it plain JS.
(function (root) {
  const GROUPS = {
    brown:    { name: 'Muddy Flats',       color: '#8A5A3B', house: 50 },
    sky:      { name: 'Breezy Bay',        color: '#62C3EA', house: 50 },
    pink:     { name: 'Sugar Hill',        color: '#E2619F', house: 100 },
    orange:   { name: 'Sunset Strip',      color: '#F28C28', house: 100 },
    red:      { name: 'Ember Heights',     color: '#DE3B33', house: 150 },
    yellow:   { name: 'Golden Grove',      color: '#F2C230', house: 150 },
    green:    { name: 'Evergreen Estates', color: '#23985A', house: 200 },
    navy:     { name: 'Royal Ridge',       color: '#2B4FB3', house: 200 },
  };

  const P = (name, group, price, rent) => ({ type: 'property', name, group, price, rent });
  const S = (name) => ({ type: 'station', name, price: 200 });
  const U = (name, kind) => ({ type: 'utility', name, kind, price: 150 });

  const SPACES = [
    { type: 'start', name: 'START' },
    P('Gravel Gulch', 'brown', 60, [2, 10, 30, 90, 160, 250]),
    { type: 'community', name: 'Block Party' },
    P('Dustbowl Drive', 'brown', 60, [4, 20, 60, 180, 320, 450]),
    { type: 'tax', name: 'Property Tax', amount: 200 },
    S('North Line Depot'),
    P('Seashell Shoals', 'sky', 100, [6, 30, 90, 270, 400, 550]),
    { type: 'luck', name: 'Lucky Break' },
    P('Driftwood Row', 'sky', 100, [6, 30, 90, 270, 400, 550]),
    P('Bodecity', 'sky', 120, [8, 40, 100, 300, 450, 600]),
    { type: 'jail', name: 'The Slammer' },
    P('Cotton Candy Court', 'pink', 140, [10, 50, 150, 450, 625, 750]),
    U('Sparky Power Co.', 'power'),
    P('Gumdrop Gardens', 'pink', 140, [10, 50, 150, 450, 625, 750]),
    P('Taffy Terrace', 'pink', 160, [12, 60, 180, 500, 700, 900]),
    S('East End Terminal'),
    P('Marmalade Mile', 'orange', 180, [14, 70, 200, 550, 750, 950]),
    { type: 'community', name: 'Block Party' },
    P('Pumpkin Patch Plaza', 'orange', 180, [14, 70, 200, 550, 750, 950]),
    P('Jerburgerville', 'orange', 200, [16, 80, 220, 600, 800, 1000]),
    { type: 'parking', name: 'Free Parking' },
    P('Chili Pepper Point', 'red', 220, [18, 90, 250, 700, 875, 1050]),
    { type: 'luck', name: 'Lucky Break' },
    P('Firecracker Flats', 'red', 220, [18, 90, 250, 700, 875, 1050]),
    P('Tilted Taylor', 'red', 240, [20, 100, 300, 750, 925, 1100]),
    S('South Shore Station'),
    P('Honeycomb Hollow', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
    P('Buttercup Bluffs', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
    U('Splash Water Works', 'water'),
    P('Sunflower Square', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),
    { type: 'gotojail', name: 'Go To The Slammer' },
    P('Mossy Meadows', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
    P('Pinecone Peak', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
    { type: 'community', name: 'Block Party' },
    P('Lawrence Landing', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),
    S('West Wind Junction'),
    { type: 'luck', name: 'Lucky Break' },
    P('Sapphire Summit', 'navy', 350, [35, 175, 500, 1100, 1300, 1500]),
    { type: 'tax', name: 'Fancy Pants Tax', amount: 100 },
    P('Barnstein Island', 'navy', 400, [50, 200, 600, 1400, 1700, 2000]),
  ];
  SPACES.forEach((s, i) => { s.index = i; });

  // Card actions:
  //  move:{to}  moveRel:{n}  nearest:{kind}  money:{amount}  jail  jailFree
  //  repairs:{house,hotel}  payEach:{amount}  collectEach:{amount}
  const LUCK = [
    { text: 'A tailwind whisks you all the way to START. Collect $200.', action: 'move', to: 0 },
    { text: 'Road trip! Advance to Tilted Taylor. If you pass START, collect $200.', action: 'move', to: 24 },
    { text: 'Sugar rush! Advance to Cotton Candy Court. If you pass START, collect $200.', action: 'move', to: 11 },
    { text: 'Catch the next train! Advance to the nearest station. If it is owned, pay the owner double rent.', action: 'nearest', kind: 'station' },
    { text: 'Catch the next train! Advance to the nearest station. If it is owned, pay the owner double rent.', action: 'nearest', kind: 'station' },
    { text: 'Your phone died. Advance to the nearest utility. If it is owned, roll and pay 10× the dice.', action: 'nearest', kind: 'utility' },
    { text: 'Your lemonade stand stock pays a dividend. Collect $50.', action: 'money', amount: 50 },
    { text: 'Escape Hatch! Keep this card until you need to bust out of The Slammer.', action: 'jailFree' },
    { text: 'You dropped your keys. Go back 3 spaces.', action: 'moveRel', n: -3 },
    { text: 'Caught jaywalking with a llama. Go directly to The Slammer. Do not pass START.', action: 'jail' },
    { text: 'Spring cleaning! Pay $25 for each house and $100 for each hotel you own.', action: 'repairs', house: 25, hotel: 100 },
    { text: 'Scooter speeding ticket. Pay $15.', action: 'money', amount: -15 },
    { text: 'All aboard! Take a ride to North Line Depot. If you pass START, collect $200.', action: 'move', to: 5 },
    { text: 'Island getaway! Advance to Barnstein Island.', action: 'move', to: 39 },
    { text: 'You were elected Block Captain. Pay each player $50.', action: 'payEach', amount: 50 },
    { text: 'Your piggy bank finally matured. Collect $150.', action: 'money', amount: 150 },
  ];

  const COMMUNITY = [
    { text: 'The neighbors throw you a parade to START. Collect $200.', action: 'move', to: 0 },
    { text: 'The bank mixed up your account with a millionaire\'s. Collect $200.', action: 'money', amount: 200 },
    { text: 'Vet bill for your pet iguana. Pay $50.', action: 'money', amount: -50 },
    { text: 'Your garage sale was a hit. Collect $50.', action: 'money', amount: 50 },
    { text: 'Escape Hatch! Keep this card until you need to bust out of The Slammer.', action: 'jailFree' },
    { text: 'You started a block party food fight. Go directly to The Slammer. Do not pass START.', action: 'jail' },
    { text: 'Your holiday savings jar is full. Collect $100.', action: 'money', amount: 100 },
    { text: 'Tax refund came through. Collect $20.', action: 'money', amount: 20 },
    { text: 'It\'s your birthday! Collect $10 from every player.', action: 'collectEach', amount: 10 },
    { text: 'Your coupon collection finally paid off. Collect $100.', action: 'money', amount: 100 },
    { text: 'You sprained your ankle doing the worm. Pay $100.', action: 'money', amount: -100 },
    { text: 'Art class supplies. Pay $50.', action: 'money', amount: -50 },
    { text: 'You fixed a neighbor\'s wifi. Collect $25.', action: 'money', amount: 25 },
    { text: 'Pothole patrol! Pay $40 for each house and $115 for each hotel you own.', action: 'repairs', house: 40, hotel: 115 },
    { text: 'Second place in the chili cook-off. Collect $10.', action: 'money', amount: 10 },
    { text: 'A long-lost aunt leaves you her button collection. It\'s worth $100. Collect it.', action: 'money', amount: 100 },
  ];

  const TOKENS = [
    { id: 'rocket', name: 'Rocket' },
    { id: 'cactus', name: 'Cactus' },
    { id: 'crown', name: 'Crown' },
    { id: 'bolt', name: 'Bolt' },
    { id: 'star', name: 'Star' },
    { id: 'paw', name: 'Paw' },
    { id: 'gem', name: 'Gem' },
    { id: 'note', name: 'Music' },
    { id: 'ball', name: 'Baseball' },
    { id: 'taco', name: 'Taco' },
  ];

  const COLORS = ['#E5484D', '#F76B15', '#FFC53D', '#30A46C', '#12A594', '#0090FF', '#6E56CF', '#D6409F', '#1C2024', '#8D6E63'];

  const CONSTANTS = {
    startCash: 1500, passStart: 200, jailIndex: 10, goToJailIndex: 30, parkingIndex: 20,
    jailFine: 50, houses: 32, hotels: 12, minPlayers: 2, maxPlayers: 8,
  };

  const data = { GROUPS, SPACES, LUCK, COMMUNITY, TOKENS, COLORS, CONSTANTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.BOARD = data;
})(this);
