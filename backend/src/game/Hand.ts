import { Card } from './Deck';

export class Hand {
    public cards: Card[] = [];
    public betSize: number = 0;
    public status: 'playing' | 'stood' | 'busted' | 'blackjack' | 'won' | 'lost' | 'push' = 'playing';

    public addCard(card: Card) {
        this.cards.push(card);
    }

    public getScore(): number {
        let score = 0;
        let aces = 0;

        for (const card of this.cards) {
            if (card.isHidden) continue;

            score += card.value;
            if (card.rank === 'A') {
                aces += 1;
            }
        }

        while (score > 21 && aces > 0) {
            score -= 10; // Convert an Ace from 11 to 1
            aces -= 1;
        }

        return score;
    }

    public isBusted(): boolean {
        return this.getScore() > 21;
    }

    public isBlackjack(): boolean {
        return this.cards.length === 2 && this.getScore() === 21;
    }
}
