import rawQuotes from "../data/quotes.txt?raw";
import rawJokes from "../data/jokes.txt?raw";

const QUOTES: string[] = rawQuotes
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const JOKES: string[] = rawJokes
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

/** Simple string hash → positive integer */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Random quote (non-deterministic). */
export function randomQuote(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

/** Deterministic quote per hour — stable across re-renders within the same hour. */
export function quoteOfTheHour(): string {
  const hour = Math.floor(Date.now() / 3_600_000);
  return QUOTES[hour % QUOTES.length];
}

/** Deterministic crypto joke per hour — used for the subtitle. */
export function jokeOfTheHour(): string {
  const hour = Math.floor(Date.now() / 3_600_000);
  return JOKES[hour % JOKES.length];
}

/** Deterministic quote derived from a string key (e.g. tx_hash). */
export function quoteForHash(key: string): string {
  return QUOTES[hashStr(key) % QUOTES.length];
}

/** Chapter 42 excerpt — shown when clicking Moby Dick on the map. */
export const CHAPTER_42 = `What the White Whale was to Ahab, has been hinted; what, at times, he was to me, as yet remains unsaid.

Aside from those more obvious considerations touching Moby Dick, which could not but occasionally awaken in any man's soul some alarm, there was another thought, or rather vague, nameless horror concerning him, which at times by its intensity completely overpowered all the rest; and yet so mystical and well nigh ineffable was it, that I almost despair of putting it in a form comprehensible. It was the whiteness of the whale that above all things appalled me. But how can I hope to explain myself here; and yet, in some dim, random way, explain myself I must, else all these chapters might be naught.

Though in many of its aspects this visible world seems formed in love, the invisible spheres were formed in fright.

Is it that by its indefiniteness it shadows forth the heartless voids and immensities of the universe, and thus stabs us from behind with the thought of annihilation, when beholding the white depths of the Milky Way? Or is it, that as in essence whiteness is not so much a color as the visible absence of color, and at the same time the concrete of all colors; is it for these reasons that there is such a dumb blankness, full of meaning, in a wide landscape of snows — a colorless, all-color of atheism from which we shrink?

And of all these things the Albino whale was the symbol. Wonder ye then at the fiery hunt?`;

/** Chapter 49 excerpt — the FAQ / book button. */
export const CHAPTER_49 = `There are certain queer times and occasions in this strange mixed affair we call life when a man takes this whole universe for a vast practical joke, though the wit thereof he but dimly discerns, and more than suspects that the joke is at nobody's expense but his own.
However, nothing dispirits, and nothing seems worth while disputing. 
He bolts down all events, all creeds, and beliefs, and persuasions, all hard things visible and invisible, never mind how knobby; as an ostrich of potent digestion gobbles down bullets and gun flints. 
And as for small difficulties and worryings, prospects of sudden disaster, peril of life and limb; all these, and death itself, seem to him only sly, good-natured hits, and jolly punches in the side bestowed by the unseen and unaccountable old joker.
That odd sort of wayward mood I am speaking of, comes over a man only in some time of extreme tribulation; it comes in the very midst of his earnestness, so that what just before might have seemed to him a thing most momentous, now seems but a part of the general joke.
There is nothing like the perils of whaling to breed this free and easy sort of genial, desperado philosophy; and with it I now regarded this whole voyage of the Pequod, and the great White Whale its object.

"Queequeg," said I, when they had dragged me, the last man, to the deck, and I was still shaking myself in my jacket to fling off the water; "Queequeg, my fine friend, does this sort of thing often happen?" Without much emotion, though soaked through just like me, he gave me to understand that such things did often happen.

"Mr. Stubb," said I, turning to that worthy, who, buttoned up in his oil-jacket, was now calmly smoking his pipe in the rain; "Mr. Stubb, I think I have heard you say that of all whalemen you ever met, our chief mate, Mr. Starbuck, is by far the most careful and prudent. I suppose then, that going plump on a flying whale with your sail set in a foggy squall is the height of a whaleman's discretion?"

"Certain. I've lowered for whales from a leaking ship in a gale off Cape Horn."

"Mr. Flask," said I, turning to little King-Post, who was standing close by; "you are experienced in these things, and I am not. Will you tell me whether it is an unalterable law in this fishery, Mr. Flask, for an oarsman to break his own back pulling himself back-foremost into death's jaws?"

"Can't you twist that smaller?" said Flask. "Yes, that's the law. I should like to see a boat's crew backing water up to a whale face foremost. Ha, ha! the whale would give them squint for squint, mind that!"

Here then, from three impartial witnesses, I had a deliberate statement of the entire case. Considering, therefore, that squalls and capsizings in the water and consequent bivouacks on the deep, were matters of common occurrence in this kind of life; considering that at the superlatively critical instant of going on to the whale I must resign my life into the hands of him who steered the boat—oftentimes a fellow who at that very moment is in his impetuousness upon the point of scuttling the craft with his own frantic stampings; considering that the particular disaster to our own particular boat was chiefly to be imputed to Starbuck's driving on to his whale almost in the teeth of a squall, and considering that Starbuck, notwithstanding, was famous for his great heedfulness in the fishery; considering that I belonged to this uncommonly prudent Starbuck's boat; and finally considering in what a devil's chase I was implicated, touching the White Whale: taking all things together, I say, I thought I might as well go below and make a rough draft of my will. "Queequeg," said I, "come along, you shall be my lawyer, executor, and legatee."

It may seem strange that of all men sailors should be tinkering at their last wills and testaments, but there are no people in the world more fond of that diversion. This was the fourth time in my nautical life that I had done the same thing. After the ceremony was concluded upon the present occasion, I felt all the easier; a stone was rolled away from my heart. Besides, all the days I should now live would be as good as the days that Lazarus lived after his resurrection; a supplementary clean gain of so many months or weeks as the case might be. I survived myself; my death and burial were locked up in my chest. I looked round me tranquilly and contentedly, like a quiet ghost with a clean conscience sitting inside the bars of a snug family vault.

Now then, thought I, unconsciously rolling up the sleeves of my frock, here goes for a cool, collected dive at death and destruction, and the devil fetch the hindmost. "`;

