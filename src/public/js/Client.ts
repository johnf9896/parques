
import Socket = SocketIOClient.Socket;
import {UIHelper} from "./UIHelper";
import {Player} from "../../models/Player";
import {Cookies} from "./Cookies";
import {Constants, Game, GameStatus} from "../../models/Game";
import {ClientGame} from "./ClientGame";
import {Color} from "../../models/Color";
import {NotificationTypes, NotifPositions, ToastrNotification} from "../../models/Notification";
import {Piece, PieceMovement} from "../../models/Piece";

export class Client {
    private socket: Socket;
    private ui: UIHelper;
    public player: Player;
    public game: ClientGame;
    public newRooms: ClientGame[];

    public constructor() {
        this.ui = new UIHelper(this);
        this.player = null;
        this.game = null;
        this.newRooms = null;
    }

    public start(): void {
        this.connect();
        this.listen();
        this.ui.configure();

        const playerId = parseInt(Cookies.get('player-id'));
        if (playerId) {
            this.tryLogIn(playerId);
        } else {
            this.ui.setStage(1);
        }
    }

    private connect(): void {
        const url = `${document.location.protocol}//${document.location.hostname}:${document.location.port}`;
        this.socket = io.connect(url, { forceNew: true });
    }

    private listen(): void {

        this.socket.on('restart', () => {
            location.reload(true);
        });

        this.socket.on('check-username', (used: boolean) => {
            this.ui.setLoading(false);
            this.ui.setUsernameUsed(used);
        });

        this.socket.on('log-in', (player: Player, game: Game) => {
            if (player) {
                this.player = player;
                Cookies.set('player-id', player.id.toString(), 1);

                if (game) {
                    this.game = new ClientGame(game, this.player);
                    if (this.game.status == GameStatus.CREATED) {
                        this.ui.setStage(4);
                    } else if (this.game.status == GameStatus.ONGOING) {
                        this.game.start(game);
                        this.ui.setStage(5);
                    }
                } else {
                    this.ui.setStage(3);
                }
            } else {
                const byCookie = Cookies.get('player-id') != null;
                Cookies.remove('player-id');
                console.log("Couldn't log in, by Cookie: " + byCookie);
                if (byCookie) {
                    this.ui.setStage(1, () => {
                        this.ui.setLoading(false);
                    });
                } else {
                    this.ui.setStage(2, () => {
                        this.ui.setUsernameUsed(true, 'El nombre de usuario se encuentra ocupado');
                    });
                }
            }
        });

        this.socket.on('room-creation', (game: Game, color: Color) => {
            this.player.color = color;
            this.game = new ClientGame(game, this.player);
            this.ui.setStage(4);
        });

        this.socket.on('new-rooms-list', (games: Game[]) => {
            this.newRooms = games.map(g => new ClientGame(g, this.player));
            this.ui.renderRoomList();
            this.socket.emit('subscribe-for-room-changes');
        });

        this.socket.on('room-joining', (game: Game, error: string, color: Color) => {
            if (game) {
                this.player.color = color;
                this.game = new ClientGame(game, this.player);
                this.ui.setStage(4);
            } else {
                console.log(error);
                const notif: ToastrNotification = {
                    title: "No se pudo unir a la sala",
                    message: error,
                    type: NotificationTypes.Error,
                    position: NotifPositions.TopCenter
                };

                UIHelper.showNotification(notif);
            }
        });

        this.socket.on('update-room', (game: Game, type: string) => {
            let room: ClientGame = null;
            if (this.game != null && this.game.id == game.id) {
                room = this.game;
            } else {
                room = this.newRooms.find(g => g.id == game.id);
            }

            if (room) {
                room.update(game, type);
                this.ui.updateRoom(room, type);
            }
        });

        this.socket.on('new-room', (game: Game) => {
            const room = new ClientGame(game, this.player);
            this.newRooms.push(room);
            this.ui.renderRoom(room);
        });

        this.socket.on('delete-room', (game: Game) => {
            const room = this.newRooms.find((r) => r.id === game.id);
            this.newRooms.splice(this.newRooms.indexOf(room), 1);
            this.ui.deleteRoom(room);
        });

        this.socket.on('start-game', (game: Game) => {
            this.game.start(game);
            this.player = this.game.players.find(p => p.id == this.player.id);
            this.ui.setStage(5);
        });

        this.socket.on('do-launch-dice', (turns: number[]) => {
            const complete: boolean[] = Array(this.game.enabledDice).fill(false);
            for (let i = 0; i < this.game.enabledDice; i++) {
                this.ui.startAnimation(i, turns[i], 0, () => {
                    this.game.log(`animation dice #${i + 1} completed`);
                    complete[i] = true;
                    if (complete.every(c => c)) {
                        this.diceAnimationComplete();
                    }
                });
            }
        });

        this.socket.on('current-player', (current: Player, enabledDice: number) => {
            this.game.currentPlayer = this.game.players.find(p => p.id == current.id);
            this.game.enabledDice = enabledDice;
            this.ui.updateCurrentPlayer();
        });

        this.socket.on('enable-pieces', (pieces: any) => {
            const map = new Map<number, number[]>();
            this.player.pieces.forEach(piece => {
                if (pieces[piece.id]) {
                    map.set(piece.id, pieces[piece.id]);
                }
            });

            this.game.log('enable pieces', map);
            this.game.piecesToMove = map;
            this.ui.updatePiecesToMove();
        });

        this.socket.on('move-piece', (movement: PieceMovement) => {
            movement.player = this.game.players.find(p => p.id == movement.player.id);
            movement.piece = movement.player.pieces.find(p => p.id == movement.piece.id);
            this.game.log(`move piece ${movement.piece.id} of ${movement.player.name} ${movement.mov} place(s)`);
            this.game.movePiece(movement);
            const invalidPiecePositions = this.game.validatePiecePositions();
            if (invalidPiecePositions.size > 0) {
                UIHelper.showNotification({
                    title: 'Error validating piece positions',
                    message: `Number of errors: ` + invalidPiecePositions.size,
                    type: NotificationTypes.Error
                });
            }

            this.ui.movePiece(movement);
        });

        this.socket.on('winner', (winner: Player) => {
            this.game.winner = winner;
            this.game.status = GameStatus.FINISHED;
            this.ui.setStage(6);
        });

        this.socket.on('request-data', (message: string) => {
            console.log(`Data request received, message=${message}`);
            let data: any;
            switch (message) {
                case 'path-points':
                    data = {};
                    this.game.pathPoints.forEach((point, pos) => {
                        data[pos] = point;
                    });

                    break;
                case 'piece-positions':
                    data = this.game.players;
                    break;
            }

            this.socket.emit('requested-data', this.game.id, message, data);
        });
    }

    public checkUsername(username: string): void {
        this.socket.emit('check-username', username);
    }

    public tryLogIn(id: number, name?: string): void {
        console.log(`Trying to log in: id=${id}, name=${name}`);
        this.socket.emit('log-in', id, name);
    }

    public logOut(): void {
        this.socket.emit('log-out');
        Cookies.remove('player-id');
        location.reload(true);
    }

    public newRoom(): void {
        this.socket.emit('create-room');
    }

    public updateRoomName(name: string): void {
        this.game.name = name;
        this.socket.emit('update-room-name', this.game.toGame());
    }

    public loadRoomList(): void {
        this.socket.emit('new-rooms-list');
    }

    public joinRoom(roomId: number): void {
        this.socket.emit('join-room', roomId);
    }

    public leaveRoom(): void {
        this.socket.emit('leave-room', this.game.id);
    }

    public startGame(): void {
        this.socket.emit('start-game', this.game.id);
    }

    public launchDice(): void {
        this.socket.emit('launch-dice', this.game.id);
    }

    public movePiece(piece: Piece, mov: number): void {
        this.socket.emit('move-piece', this.game.id, piece, mov);
    }

    public diceAnimationComplete(): void {
        this.socket.emit('dice-animation-complete', this.game.id);
    }

    public moveAnimationComplete(): void {
        this.socket.emit('move-animation-complete', this.game.id);
    }
}