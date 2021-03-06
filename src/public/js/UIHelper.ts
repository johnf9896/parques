
import {Client} from "./Client";
import Timer = NodeJS.Timer;
import {ClientGame} from "./ClientGame";
import {NotificationTypes, NotifPositions, ToastrNotification} from "../../models/Notification";
import {Constants} from "../../models/Game";
import {Piece, PiecePositions, PieceMovement} from "../../models/Piece";
import {Colors} from "../../models/Color";
import {Point} from "../../models/Point";
import {Player} from "../../models/Player";
import {PopoverOption} from "bootstrap";
import maxImages = Constants.maxImages;
import animationTime = Constants.animationTime;
import animationDelay = Constants.animationDelay;

export class UIHelper {

    private client: Client;

    private game: ClientGame;

    private stage: number = 0;

    private content: JQuery;

    private loading: JQuery;

    private username: JQuery;

    private roomNameInput: JQuery;

    private roomList: JQuery;

    private board: JQuery;

    public constructor(client: Client) {
        this.client = client;
        this.content = $("#content");
        this.loading = $("#loading");
    }

    public configure(): void {
        UIHelper.configureToastr();
        this.configureEvents();
    }

    private configureEvents(): void {
        this.enterBtnClick();
        this.usernameTypingStopped();
        this.logOutBtnClick();
        this.newRoomBtnClick();
        this.editRoomNameBtnClick();
        this.roomNameTypingStopped();
        this.joinRoomBtnClick();
        this.leaveRoomBtnClick();
        this.startGameBtnClick();
        this.launchDiceBtnClick();
        this.returnBtnClick();
    }

    public setStage(stage: number, callback?: () => void): void {
        console.log(`Changing stage... current=${this.stage}, new=${stage}, callback=${callback ? 'yes' : 'no'}`);
        if (this.stage != stage) {
            this.stage = stage;
            this.setLoading(true);
            if (stage == 0) {
                this.content.html('');
            } else {
                this.content.load(`stages/stage${this.stage}.html`, () => {
                    console.log(`Stage ${this.stage} loaded`);
                    this.setLoading(false);
                    this.onStageChange();
                    if (callback) callback();
                });
            }
        } else {
            if (callback) callback();
        }
    }

    public setLoading(loading: boolean): void {
        if (loading) {
            this.loading.show();
        } else {
            this.loading.hide();
        }
    }

    public setUsernameUsed(used: boolean, text ?: string): void {
        if (used) {
            text = text || 'Ocupado';
            text = `<strong style="color: red">${text}</strong>`;
        } else {
            text = text || 'Disponible';
            text = `<strong style="color: green">${text}</strong>`;
            $('#btn-log-in').removeAttr('disabled');
        }

        UIHelper.updatePopover('#username', text);
    }

    private onStageChange(): void {
        this.game = this.client.game;
        switch (this.stage) {
            case 2:
                this.username = $('#username');
                this.username.popover(<PopoverOption>{
                    content: '',
                    placement: 'right',
                    trigger: 'manual',
                    html: true
                });

                $("#log-in-form").submit(() => {
                    this.username.popover('hide');
                    this.client.tryLogIn(null, this.username.val() as string);
                    $('#btn-log-in').attr('disabled', 'disabled');

                    return false;
                });

                break;

            case 3:
                this.roomList = $('#room-list');
                this.client.loadRoomList();

                break;

            case 4:
                this.roomNameInput = $('#room-input-name');
                this.setEditRoomName(false);

                this.roomNameInput.popover(<PopoverOption>{
                    content: '',
                    placement: 'top',
                    trigger: 'manual',
                    html: true
                });

                $('#room-name-form').submit(() => {
                    if (!this.roomNameInput.attr('disabled')) {
                        this.roomNameInput.popover('hide');
                        this.client.updateRoomName($('#room-input-name').val().toString());
                        this.setEditRoomName(false);
                    }
                    return false;
                });

                if (this.game.creator.id != this.client.player.id) {
                    $('#btn-edit-room-name').hide();
                    $('#card-footer').hide();
                } else {
                    $('#btn-start-game').attr('disabled', 'disabled');
                }

                this.renderStage4Players();

                break;

            case 5:
                // TODO Add room name change on stage 5
                this.board = $('#board');
                const width = this.board.parent().width();
                const height = this.board.parent().height();

                this.board.attr('width', width);
                this.board.attr('height', height);
                this.game.setSize(width, height);
                this.game.calculatePathPoints();
                const invalidPathPoints = this.game.validatePathPoints();
                if (invalidPathPoints.size > 0) {
                    UIHelper.showNotification({
                        title: 'Error validating path points',
                        message: `Number of errors: ` + invalidPathPoints.size,
                        type: NotificationTypes.Error
                    });
                }

                $('#room-name').text(this.game.name);
                $('#btn-launch-dice').attr('disabled', 'disable');

                this.game.dice.forEach((dice, i) => {
                    UIHelper.setDiceImage(i, dice);
                });

                this.renderStage5Players();
                this.renderBoard();

                this.client.diceAnimationComplete();

                break;

            case 6:
                $('#room-name').text(this.game.name);
                this.renderStage6Players();

                break;
        }
    }

    private enterBtnClick(): void {
        $("body").on('click', '#btn-enter', () => {
            this.setStage(2);
        });
    }

    private usernameTypingStopped(): void {
        const client = this.client;
        const ui = this;
        let timer: Timer = null;
        $('body').on('input', '#username', () => {
            clearTimeout(timer);
            timer = setTimeout(doStuff, 1000);
        });

        function doStuff() {
            const uname = ui.username.val() as string;
            $('#btn-log-in').attr('disabled', 'disabled');
            if (uname.length < 4) {
                UIHelper.updatePopover('#username', '<strong style="color: red">Mínimo 4 carácteres</strong>');
            } else {
                ui.setLoading(true);
                ui.username.popover('hide');
                client.checkUsername(uname);
            }
        }
    }

    private logOutBtnClick(): void {
        $('body').on('click', '#btn-log-out', () => {
            this.client.logOut();
        });
    }

    private newRoomBtnClick(): void {
        $('body').on('click', '#btn-new-room', () => {
            this.setLoading(true);
            this.client.newRoom();
        });
    }

    private editRoomNameBtnClick(): void {
        $('body').on('click', '#btn-edit-room-name', () => {
            this.setEditRoomName(true);
        });
    }

    private roomNameTypingStopped(): void {
        const ui = this;
        let timer: Timer = null;
        $('body').on('input', '#room-input-name', () => {
            $('#btn-save-room-name').attr('disabled', 'disabled');
            clearTimeout(timer);
            timer = setTimeout(doStuff, 1000);
        });

        function doStuff() {
            const name = ui.roomNameInput.val() as string;
            if (name.length < 4) {
                UIHelper.updatePopover('#room-input-name', '<strong style="color: red">Mínimo 4 carácteres</strong>');
            } else if (name.length > 16) {
                UIHelper.updatePopover('#room-input-name', '<strong style="color: red">Máximo 16 carácteres</strong>');
            } else {
                $('#btn-save-room-name').removeAttr('disabled');
                ui.roomNameInput.popover('hide');
            }
        }
    }

    private joinRoomBtnClick(): void {
        const client = this.client;
        $('body').on('click', '.btn-join-room', function() {
            const room = $(this).closest('.room');
            const id = parseInt((<string>room.attr('id')).substr(5));
            client.joinRoom(id);
        });
    }

    private leaveRoomBtnClick(): void {
        $('body').on('click', '#btn-leave-room', () => {
            this.client.leaveRoom();
            this.setStage(3);
        });
    }

    private startGameBtnClick(): void {
        $('body').on('click', '#btn-start-game', () => {
            this.client.startGame();
        });
    }

    private launchDiceBtnClick(): void {
        $('body').on('click', '#btn-launch-dice', () => {
            $('#btn-launch-dice').attr('disabled', 'disabled');
            this.client.launchDice();
        });
    }

    private returnBtnClick(): void {
        $('body').on('click', '#btn-return', () => {
            this.setStage(3);
        });
    }

    private renderStage3Players(game: ClientGame): void {
        const playerList = $(`#room-${game.id}`).find(`.player-list`);
        playerList.empty();
        for (const player of game.players) {
            $(`<div class="d-flex flex-row player">
                <div class="p-2"><img src="img/${player.color.code}_piece.png"/></div>
                <div class="p-2"><p class="card-text">${player.name}</p></div>
            </div>`).appendTo(playerList);
        }
    }

    private renderStage4Players(): void {
        const playerList = $('#player-list');
        playerList.empty();
        for (const player of this.game.players) {
            $(`<div class="d-flex flex-row player">
                <div class="p-2"><img src="img/${player.color.code}_piece.png"/></div>
                <div class="p-2"><p class="card-text">${player.name}</p></div>
            </div>`).appendTo(playerList);
        }
    }

    private renderStage5Players(): void {
        const playerList = $('#player-list');
        playerList.empty();
        for (const player of this.game.players) {
            let text = '';
            if (this.game.currentPlayer.id === player.id) {
                if (this.game.player.id == player.id) {
                    text += '<div class="ml-auto p-2"><span class="badge badge-success"><span class="oi oi-star"></span> Turno</span></div>';
                } else {
                    text += '<div class="ml-auto p-2"><span class="badge badge-primary">Turno</span></div>';
                }
            } else if (this.game.player.id == player.id) {
                text += '<div class="ml-auto p-2"><span class="badge badge-success"><span class="oi oi-star"></span></span></div>';
            }

            $(`<div class="d-flex flex-row player">
                <div class="p-2"><img src="img/${player.color.code}_piece.png"/></div>
                <div class="p-2"><p class="card-text">${player.name}</p></div>
                ${text}
            </div>`).appendTo(playerList);
        }
    }

    private renderStage6Players(): void {
        const playerList = $('#player-list');
        playerList.empty();
        for (const player of this.game.players) {
            let text = '';
            if (this.game.winner.id === player.id) {
                if (this.game.player.id == player.id) {
                    text += '<div class="ml-auto p-2"><span class="badge badge-success"><span class="oi oi-star"></span> Ganador</span></div>';
                } else {
                    text += '<div class="ml-auto p-2"><span class="badge badge-success">Ganador</span></div>';
                }
            } else if (this.game.player.id == player.id) {
                text += '<div class="ml-auto p-2"><span class="badge badge-primary"><span class="oi oi-star"></span></span></div>';
            }

            $(`<div class="d-flex flex-row player">
                <div class="p-2"><img src="img/${player.color.code}_piece.png"/></div>
                <div class="p-2"><p class="card-text">${player.name}</p></div>
                ${text}
            </div>`).appendTo(playerList);
        }
    }

    private setEditRoomName(edit: boolean): void {
        const roomName = $('#room-name');
        const roomInputName = $('#room-input-name');
        const noEditRoomContainer = $('#no-edit-room-container');
        const editRoomContainer = $('#edit-room-container');

        if (edit) {
            roomInputName.val(this.game.name);
            noEditRoomContainer.hide();
            editRoomContainer.show();
        } else {
            roomName.text(this.game.name);
            noEditRoomContainer.show();
            editRoomContainer.hide();

            if (this.game.creator.id != this.client.player.id) {
                $('#btn-edit-room-name').hide();
            }
        }
    }

    public renderRoomList(): void {
        this.roomList.empty();
        for (const game of this.client.newRooms) {
            this.renderRoom(game);
        }
    }

    public renderRoom(game: ClientGame): void {
        $(`<div class="d-inline-flex p-2 align-items-stretch room" id="room-${game.id}">
                <div class="card">
                    <h4 class="card-header room-name">${game.name}</h4>
                    <div class="card-body">
                        <div class="d-flex flex-column player-list"></div>
                    </div>
                    <div class="card-footer">
                        <button class="btn btn-primary btn-join-room"><span class="oi oi-account-login"></span> Unirse</button>
                    </div>
                </div>
            </div>`).appendTo(this.roomList);

        this.renderStage3Players(game);
    }

    public updateRoom(game: ClientGame, type: string): void {
        if (this.stage == 3) {
            if (type == 'name') {
                $(`#room-${game.id}`).find(`.room-name`).text(game.name);
            } else if (type == 'players') {
                this.renderStage3Players(game);
            }
        } else if (this.stage == 4) {
            if (type == 'name') {
                $('#room-name').text(game.name);
            } else if (type == 'players') {
                this.renderStage4Players();

                if (game.creator.id == this.client.player.id) {
                    $('#btn-edit-room-name').show();
                    $('#card-footer').show();
                }

                if (game.players.length >= Constants.minPlayers) {
                    $('#btn-start-game').removeAttr('disabled');
                } else {
                    $('#btn-start-game').attr('disabled', 'disabled');
                }
            }
        }
    }

    public deleteRoom(game: ClientGame): void {
        $(`#room-${game.id}`).remove();
    }

    public updateCurrentPlayer(): void {

        if (this.game.enabledDice == 2) {
            $('#dice-2').show();
        } else {
            $('#dice-2').hide();
        }

        if (this.game.currentPlayer.id == this.client.player.id) {
            $('#btn-launch-dice').removeAttr('disabled');
        }

        this.renderStage5Players();
    }

    private renderBoard(): void {
        const width = this.board.width();
        const height = this.board.height();

        this.game.calculatePiecePositions();
        const invalidPiecePositions = this.game.validatePiecePositions();
        if (invalidPiecePositions.size > 0) {
            UIHelper.showNotification({
                title: 'Error validating piece positions',
                message: `Number of errors: ` + invalidPiecePositions.size,
                type: NotificationTypes.Error
            });
        }

        const pieceRadius = this.game.pieceRadius;
        const center = this.game.center;

        this.board.clearCanvas();

        this.board.addLayer({
            type: 'image',
            source: 'img/board.png',
            x: center.x, y: center.y,
            width: width, height: height,
            rotate: this.game.rotation
        });

        for (const player of this.game.players) {
            const secondColor = player.color.code == Colors.YELLOW.code ? '#000' : '#FFF';

            for (const piece of player.pieces) {

                this.board.addLayer({
                    type: 'ellipse',
                    x: piece.p.x,
                    y: piece.p.y,
                    width: piece.radius * 2,
                    height: piece.radius * 2,
                    fillStyle: player.color.value,
                    strokeWidth: 2,
                    strokeStyle: secondColor,
                    name: `p-${player.id}-${piece.id}`,
                    groups: ['pieces', 'circles', `p-${player.id}`, `p-${player.id}-${piece.id}`],
                    data: {
                        player: player,
                        piece: piece
                    },
                    mouseover: (layer) => {
                        const player = layer.data.player;
                        const piece = layer.data.piece;
                        const name = `burble-${player.id}-${piece.id}`;
                        this.board.setLayerGroup('mov-burbles', {
                            visible: false
                        }).setLayerGroup(name, {
                            visible: true
                        }).drawLayers();
                    }
                });

                this.board.addLayer({
                    type: 'text',
                    x: piece.p.x,
                    y: piece.p.y,
                    text: piece.id.toString(),
                    fillStyle: secondColor,
                    fontStyle: 'bold',
                    fontSize: pieceRadius,
                    fontFamily: 'Trebuchet MS, sans-serif',
                    name: `t-${player.id}-${piece.id}`,
                    groups: ['pieces', 'texts', `t-${player.id}`, `p-${player.id}-${piece.id}`],
                    data: {
                        player: player,
                        piece: piece
                    }
                });
            }

            // this.drawPath();

            this.board.drawLayers();
        }
    }

    public updatePiecesToMove(): void {

        const pieceRadius = this.game.pieceRadius;

        const pieces = this.game.currentPlayer.pieces;
        this.game.piecesToMove.forEach((movements, pieceId) => {
            const piece = pieces.find(p => p.id == pieceId);
            const start = new Point(piece.p.x - (movements.length - 1) * pieceRadius, piece.p.y - pieceRadius * 2 - 3);
            if (start.x - pieceRadius < 0) {
                start.x = pieceRadius;
            } else if (start.x + (movements.length * 2 - 1) * pieceRadius > this.game.width) {
                start.x = this.game.width - (movements.length * 2 - 1) * pieceRadius;
            }

            if (start.y < 0) {
                start.y = piece.p.y + pieceRadius * 2 + 3;
            }

            movements.forEach((mov, i) => {
                const point = new Point(start.x + i * pieceRadius * 2, start.y);
                this.board.addLayer({
                    type: 'rectangle',
                    x: point.x,
                    y: point.y,
                    width: pieceRadius * 2,
                    height: pieceRadius * 2,
                    fillStyle: '#FFF',
                    strokeWidth: 1,
                    strokeStyle: '#000',
                    groups: ['mov-burbles', `burble-${this.game.currentPlayer.id}-${piece.id}`],
                    visible: false,
                    data: {
                        piece: piece,
                        movement: mov
                    },
                    click: layer => {
                        const piece = layer.data.piece;
                        const mov = layer.data.movement;
                        this.client.movePiece(piece, mov);

                        this.board.removeLayerGroup('mov-burbles')
                            .drawLayers();
                    }
                });

                let text = mov.toString();
                if (piece.position == PiecePositions.JAIL) {
                    text = piece.position + mov == PiecePositions.START ? 'S' : (mov - PiecePositions.START + PiecePositions.JAIL).toString();
                }

                this.board.addLayer({
                    type: 'text',
                    x: point.x,
                    y: point.y,
                    text: text,
                    fillStyle: '#000',
                    fontStyle: 'bold',
                    fontSize: pieceRadius,
                    fontFamily: 'Trebuchet MS, sans-serif',
                    groups: ['mov-burbles', `burble-${this.game.currentPlayer.id}-${piece.id}`],
                    visible: false
                });
            });

            this.board.drawLayers();
        });
    }

    public movePiece(movement: PieceMovement): void {
        let animated = false;
        for (const player of this.game.players) {
            for (const piece of player.pieces) {
                const layer = this.board.getLayer(`p-${player.id}-${piece.id}`);
                let animate = false;

                if (Math.abs(layer.x - piece.p.x) >= 1) {
                    animate = true;
                }

                if (Math.abs(layer.y - piece.p.y) >= 1) {
                    animate = true;
                }

                if (Math.abs(layer.width - piece.radius * 2) >= 1) {
                    animate = true;
                }

                if (animate) {
                    animated = true;
                    this.board.animateLayerGroup(`p-${player.id}-${piece.id}`, {
                        x: (layer: JCanvasLayerDef) => layer.data.piece.p.x,
                        y: (layer: JCanvasLayerDef) => layer.data.piece.p.y,
                        width: (layer: JCanvasLayerDef) => layer.data.piece.radius * 2,
                        height: (layer: JCanvasLayerDef) => layer.data.piece.radius * 2
                    }, 500, layer => {
                        if (layer.name == `p-${movement.player.id}-${movement.piece.id}`) {
                            this.client.moveAnimationComplete();
                        }
                    });
                }
            }
        }

        if (!animated) {
            this.client.moveAnimationComplete();
        }
    }

    private static setDiceImage(dice: number, num: number) {
        const d = dice + 1;
        $(`#dice-${d}`).find('.dice').hide();
        $(`#dice-${d}-${num}`).show();
    }

    private drawPath(): void {
        for (let pos = PiecePositions.JAIL; pos <= PiecePositions.END; pos++) {
            const point = this.game.pathPoints.get(pos);
            this.board.addLayer({
                type: 'text',
                x: point.x,
                y: point.y,
                text: pos.toString(),
                fillStyle: '#000',
                fontStyle: 'bold',
                fontSize: 15,
                fontFamily: 'Trebuchet MS, sans-serif'
            });

            this.board.addLayer({
                type: 'vector',
                x: point.x,
                y: point.y,
                strokeWidth: 2,
                strokeStyle: '#F0F',
                a1: point.dir,
                l1: 20,
                inDegrees: false
            });
        }
    }

    private static updatePopover(selector: string, content: string, title ?: string, position ?: string): void {
        const element = $(selector);

        element.attr('data-content', content);
        if (title) {
            element.attr('data-title', title);
        }

        element.popover('show');
        const popover = element.data('bs.popover');
        popover.setContent();
        $(popover.tip).addClass(popover.config.placement);

        if (position) {
            element.attr('data-placement', position);
            element.popover('update');
        }
    }

    public startAnimation(dice: number, turns: number, i: number, complete: () => void): void {

        if (i == turns) {
            complete();
            return;
        }

        this.game.dice[dice]++;
        if (this.game.dice[dice] > maxImages) {
            this.game.dice[dice] = 1;
        }

        UIHelper.setDiceImage(dice, this.game.dice[dice]);

        let time;
        if (turns - i > 3 * maxImages) {
            time = animationTime;
        } else {
            const laps = turns - 3 * maxImages;
            time = animationTime + (i - laps) * animationDelay;
        }

        setTimeout(() => {
            this.startAnimation(dice, turns, i + 1, complete);
        }, time);
    }

    /**
     * Muestra la notificación en pantalla.
     *
     * @method showNotification
     * @param {ToastrNotification} notification La notificación que se quiere mostrar.
     * @static
     */
    public static showNotification(notification: ToastrNotification) {
        if (notification.position == null) {
            notification.position = NotifPositions.TopRight;
        }

        toastr.options.positionClass = "toast-" + notification.position.name;
        let displayMethod: ToastrDisplayMethod;
        if (notification.type == NotificationTypes.Success) {
            displayMethod = toastr.success;
        } else if (notification.type == NotificationTypes.Info) {
            displayMethod = toastr.info;
        } else if (notification.type == NotificationTypes.Warning) {
            displayMethod = toastr.warning;
        } else {
            displayMethod = toastr.error;
        }

        if (notification.title != null) {
            displayMethod(notification.message, notification.title);
        } else {
            displayMethod(notification.message);
        }
    }

    /**
     * Configura el la biblioteca de notificaciones toastr.
     *
     * @method configureToastr
     * @static
     */
    private static configureToastr() {

        toastr.options = {
            "closeButton": false,
            "debug": false,
            "newestOnTop": false,
            "progressBar": false,
            "positionClass": "toast-top-right",
            "preventDuplicates": false,
            "onclick": null,
            "showDuration": 300,
            "hideDuration": 1000,
            "timeOut": 3000,
            "extendedTimeOut": 1000,
            "showEasing": "swing",
            "hideEasing": "linear",
            "showMethod": "fadeIn",
            "hideMethod": "fadeOut"
        };
    }
}
