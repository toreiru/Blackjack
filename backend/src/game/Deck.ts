export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
    suit: Suit;
    rank: Rank;
    value: number;
    isHidden?: boolean;
}

export class Deck {
    private cards: Card[] = [];

    constructor(numDecks: number = 6) {
        this.initialize(numDecks);
        this.shuffle();
    }

    private initialize(numDecks: number) {
        const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

        for (let d = 0; d < numDecks; d++) {
            for (const suit of suits) {
                for (const rank of ranks) {
                    let value = parseInt(rank);
                    if (['J', 'Q', 'K'].includes(rank)) value = 10;
                    if (rank === 'A') value = 11; // Hand logic handles 1/11

                    this.cards.push({ suit, rank, value });
                }
            }
        }
    }

    public shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    public draw(): Card {
        if (this.cards.length < 20) {
            // Re-shuffle a new shoe if cards are running low
            this.cards = [];
            this.initialize(6);
            this.shuffle();
        }
        return this.cards.pop()!;
    }

    public getRemainingCards(): number {
        return this.cards.length;
    }
}
