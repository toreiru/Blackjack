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

    public removePlayer(socketId: string, broadcastFn?: () => void) {
        this.players.delete(socketId);
        if (this.players.size === 0) {
            this.resetTable();
            this.deck = new Deck(6); // Replenish shoe when table empties
        } else if (this.state === 'playing') {
            this.skipCompletedTurns(broadcastFn);
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
                const player = this.players.get(socketId);
                if (!player) continue;
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

            if (!player || player.hand.status === 'blackjack' || player.hand.isBusted()) {
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

        let totalPot = 0;
        const validPlayers: Player[] = [];

        // 1. Calculate total pot and filter out busted players
        this.players.forEach(player => {
            totalPot += player.hand.betSize;
            if (player.hand.isBusted()) {
                player.hand.status = 'lost';
            } else {
                validPlayers.push(player);
            }
        });

        // 2. Determine who the "winners" are
        let winningPlayers: Player[] = [];

        if (validPlayers.length > 0) {
            if (!dealerBusted) {
                // If dealer didn't bust, players must beat the dealer's score to even qualify
                const playersBeatingDealer = validPlayers.filter(p => p.hand.getScore() > dealerScore);

                if (playersBeatingDealer.length > 0) {
                    // Find the highest score among players who beat the dealer
                    const highestScore = Math.max(...playersBeatingDealer.map(p => p.hand.getScore()));
                    winningPlayers = playersBeatingDealer.filter(p => p.hand.getScore() === highestScore);
                } else {
                    // Everyone tied or lost to dealer. Dealer keeps the pot.
                    validPlayers.forEach(p => {
                        if (p.hand.getScore() === dealerScore) p.hand.status = 'push';
                        else p.hand.status = 'lost';
                    });
                }
            } else {
                // Dealer busted. Find the highest score among surviving players
                const highestScore = Math.max(...validPlayers.map(p => p.hand.getScore()));
                winningPlayers = validPlayers.filter(p => p.hand.getScore() === highestScore);
            }
        }

        // 3. Mark non-winners as lost
        validPlayers.forEach(p => {
            if (!winningPlayers.includes(p) && p.hand.status !== 'push') {
                p.hand.status = 'lost';
            }
        });

        // 4. Calculate payouts proportionally for winners
        const results: { userId: number, payout: number }[] = [];

        if (winningPlayers.length > 0) {
            // Mark them as 'won'
            winningPlayers.forEach(p => p.hand.status = 'won');

            if (winningPlayers.length === 1) {
                // Single winner takes the whole pot
                results.push({ userId: winningPlayers[0].userId, payout: totalPot });
            } else {
                // Multiple ties: proportion based on bet size
                const totalWinnerBets = winningPlayers.reduce((sum, p) => sum + p.hand.betSize, 0);

                // If by some extreme edge case totalWinnerBets is 0 (free games?), split evenly
                if (totalWinnerBets === 0) {
                    const splitPot = Math.floor(totalPot / winningPlayers.length);
                    winningPlayers.forEach(p => results.push({ userId: p.userId, payout: splitPot }));
                } else {
                    winningPlayers.forEach(p => {
                        // Everyone gets their exact bet back FIRST to ensure no one loses money on a tie where they bet more
                        let proportionalWin = 0;
                        const otherPlayersPot = totalPot - totalWinnerBets; // The "dead" money from losers

                        if (otherPlayersPot > 0) {
                            // Split the dead money proportionally
                            const sharePercentage = p.hand.betSize / totalWinnerBets;
                            proportionalWin = Math.floor(otherPlayersPot * sharePercentage);
                        }

                        const finalPayout = p.hand.betSize + proportionalWin;
                        results.push({ userId: p.userId, payout: finalPayout });
                    });
                }
            }
        } else {
            // Push exact bets back if dealer tied everyone remaining
            const pushPlayers = validPlayers.filter(p => p.hand.status === 'push');
            pushPlayers.forEach(p => {
                results.push({ userId: p.userId, payout: p.hand.betSize });
            });
        }

        this.state = 'gameOver';

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
