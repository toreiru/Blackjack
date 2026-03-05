import { Deck } from './Deck';
import { Hand } from './Hand';

export interface Player {
    socketId: string;
    userId: number;
    username: string;
    coins: number;
    hand: Hand;
}

export class BlackjackTable {
    public id: string;
    public players: Map<string, Player> = new Map(); // socketId -> Player
    public dealerHand: Hand = new Hand();
    public deck: Deck = new Deck(6);
    public state: 'waiting' | 'betting' | 'playing' | 'dealerTurn' | 'gameOver' = 'waiting';
    public currentPlayerTurnIndex: number = 0;
    public playerTurnOrder: string[] = [];

    public onRoundEnded?: (results: { userId: number, payout: number }[]) => void;

    constructor(id: string) {
        this.id = id;
    }

    public addPlayer(socketId: string, userId: number, username: string, coins: number): boolean {
        if (this.players.size >= 5 || this.state !== 'waiting') return false;

        this.players.set(socketId, {
            socketId,
            userId,
            username,
            coins,
            hand: new Hand()
        });
        return true;
    }

    public removePlayer(socketId: string) {
        this.players.delete(socketId);
        if (this.players.size === 0) {
            this.resetTable();
            this.deck = new Deck(6); // Replenish shoe when table empties
        }
    }

    public startBettingPhase() {
        if (this.players.size === 0) return;
        this.state = 'betting';
        this.dealerHand = new Hand();
        this.players.forEach(p => p.hand = new Hand());
    }

    public placeBet(socketId: string, amount: number): boolean {
        const player = this.players.get(socketId);
        if (!player || this.state !== 'betting') return false;

        player.hand.betSize = amount;
        return true;
    }

    public allBetsPlaced(): boolean {
        let allPlaced = true;
        this.players.forEach(p => {
            if (p.hand.betSize <= 0) allPlaced = false;
        });
        return allPlaced && this.players.size > 0;
    }

    public async dealInitialCards(broadcastFn: () => void) {
        if (this.state !== 'betting') return;

        this.playerTurnOrder = Array.from(this.players.keys());

        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

        // Deal 2 cards to each player sequentially
        for (let i = 0; i < 2; i++) {
            for (const socketId of this.playerTurnOrder) {
                const player = this.players.get(socketId)!;
                player.hand.addCard(this.deck.draw());
                broadcastFn();
                await sleep(800); // UI deal animation delay
            }
            // Deal to dealer. Second card is hidden.
            const dealerCard = this.deck.draw();
            if (i === 1) dealerCard.isHidden = true;
            this.dealerHand.addCard(dealerCard);
            broadcastFn();
            await sleep(800);
        }

        // Check for immediate blackjacks
        this.players.forEach(p => {
            if (p.hand.isBlackjack()) p.hand.status = 'blackjack';
        });

        this.state = 'playing';
        this.currentPlayerTurnIndex = 0;
        broadcastFn(); // Force update so "playing" appears before skips
        this.skipCompletedTurns(broadcastFn);
    }

    private skipCompletedTurns(broadcastFn?: () => void) {
        let changed = false;
        while (this.currentPlayerTurnIndex < this.playerTurnOrder.length) {
            const currentSocketId = this.playerTurnOrder[this.currentPlayerTurnIndex];
            const player = this.players.get(currentSocketId);

            if (player && (player.hand.status === 'blackjack' || player.hand.isBusted())) {
                this.currentPlayerTurnIndex++;
                changed = true;
            } else {
                break; // Found a player who needs to act
            }
        }

        if (changed && broadcastFn) broadcastFn();

        if (this.currentPlayerTurnIndex >= this.playerTurnOrder.length) {
            this.playDealerTurn(broadcastFn);
        }
    }

    public hit(socketId: string, broadcastFn?: () => void): boolean {
        if (this.state !== 'playing') return false;
        if (this.playerTurnOrder[this.currentPlayerTurnIndex] !== socketId) return false;

        const player = this.players.get(socketId)!;
        player.hand.addCard(this.deck.draw());

        if (player.hand.isBusted()) {
            player.hand.status = 'busted';
            this.currentPlayerTurnIndex++;
            this.skipCompletedTurns(broadcastFn);
        }

        return true;
    }

    public stand(socketId: string, broadcastFn?: () => void): boolean {
        if (this.state !== 'playing') return false;
        if (this.playerTurnOrder[this.currentPlayerTurnIndex] !== socketId) return false;

        const player = this.players.get(socketId)!;
        player.hand.status = 'stood';

        this.currentPlayerTurnIndex++;
        this.skipCompletedTurns(broadcastFn);

        return true;
    }

    private async playDealerTurn(broadcastFn?: () => void) {
        this.state = 'dealerTurn';
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

        // Reveal hole card
        if (this.dealerHand.cards.length > 1) {
            this.dealerHand.cards[1].isHidden = false;
            if (broadcastFn) broadcastFn();
            await sleep(800);
        }

        // Dealer hits on soft 17 (or strictly stands on 17+, let's do strictly stand on 17+)
        while (this.dealerHand.getScore() < 17) {
            this.dealerHand.addCard(this.deck.draw());
            if (broadcastFn) broadcastFn();
            await sleep(800);
        }

        this.evaluateWinners();
        if (broadcastFn) broadcastFn();
    }

    private evaluateWinners() {
        const dealerScore = this.dealerHand.getScore();
        const dealerBusted = this.dealerHand.isBusted();

        this.players.forEach(player => {
            const pHand = player.hand;
            if (pHand.status === 'busted') {
                pHand.status = 'lost';
                return;
            }

            if (pHand.status === 'blackjack') {
                if (this.dealerHand.isBlackjack()) {
                    pHand.status = 'push';
                } else {
                    pHand.status = 'won'; // pays 3:2 generally, handled in game loop
                }
                return;
            }

            if (dealerBusted) {
                pHand.status = 'won';
            } else if (pHand.getScore() > dealerScore) {
                pHand.status = 'won';
            } else if (pHand.getScore() < dealerScore) {
                pHand.status = 'lost';
            } else {
                pHand.status = 'push';
            }
        });

        this.state = 'gameOver';

        // Calculate payouts
        const results: { userId: number, payout: number }[] = [];
        this.players.forEach(player => {
            let payout = 0;
            if (player.hand.status === 'won') payout = player.hand.betSize * 2;
            else if (player.hand.status === 'blackjack') payout = player.hand.betSize * 2.5;
            else if (player.hand.status === 'push') payout = player.hand.betSize;

            if (payout > 0) {
                results.push({ userId: player.userId, payout });
            }
        });

        if (this.onRoundEnded && results.length > 0) {
            this.onRoundEnded(results);
        }
    }

    public resetTable() {
        this.state = 'waiting';
        this.dealerHand = new Hand();
        this.players.forEach(p => p.hand = new Hand());
        this.currentPlayerTurnIndex = 0;
        this.playerTurnOrder = [];
    }
}
