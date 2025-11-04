// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract TradeNestEscrow is ReentrancyGuard{
    address public buyer;
    address public seller;
    address public bot;
    uint256 public amount;
    address public feeReceiver;

    uint256 public constant FEE_BPS = 250; // 2.5%
    uint256 public constant TOTAL_FEE_BPS = 500; // 5% total (2.5% buyer + 2.5% seller)
    uint256 public constant BOT_SHARE_BPS = 100; // 0.5%

    uint256 public pendingBotFee;
    uint256 public pendingReceiverFee;

    uint256 public deliveryTimestamp;
    uint256 public releaseTimeout = 1 days;

    enum TradeStatus {
        Created,
        Funded,
        Delivered,
        Completed,
        Cancelled,
        Disputed
    }
    TradeStatus public status;

    // --- EVENTS ---
    event Funded(address indexed buyer, uint amount);
    event Delivered(address indexed seller);
    event Approved(address indexed buyer);
    event Released(address indexed to, uint amount);

    modifier onlyBot() {
        require(msg.sender == bot, "only bot can call this");
        _;
    }

    constructor(address _buyer, address _seller, address _bot, address _feeReceiver) {
        require(_buyer != _seller, "buyer and seller cannot be the same");
        require(_bot != address(0), "invalid bot address");
        require(_feeReceiver != address(0), "invalid fee receiver address");

        buyer = _buyer;
        seller = _seller;
        bot = _bot;
        feeReceiver = _feeReceiver;
        status = TradeStatus.Created;
    }

    function fund() public payable nonReentrant {
        require(msg.sender == buyer, "only buyer can fund");
        require(status == TradeStatus.Created, "trade not at 'created' state");
        require(msg.value > 0, "must send funds");

        uint256 baseAmount = (msg.value * 10000) / (10000 + FEE_BPS);
        uint256 buyerFee = msg.value - baseAmount;

        amount = baseAmount;
        status = TradeStatus.Funded;

        uint256 botFee = (buyerFee * BOT_SHARE_BPS) / TOTAL_FEE_BPS;
        uint256 receiverFee = buyerFee - botFee;

        pendingBotFee += botFee;
        pendingReceiverFee += receiverFee;

        emit Funded(buyer, amount);
    }

    receive() external payable {
        fund();
    }

    // All role actions now go through the bot
    function markDelivered() external onlyBot {
        require(status == TradeStatus.Funded, "trade not at 'funded' state");

        status = TradeStatus.Delivered;
        deliveryTimestamp = block.timestamp;
        emit Delivered(seller);
    }

    function approveDelivery() external onlyBot {
        require(
            status == TradeStatus.Delivered,
            "trade not at 'delivered' state"
        );

        emit Approved(buyer);
        _release();
    }

    function releaseAfterTimeout() external onlyBot {
        require(
            status == TradeStatus.Delivered,
            "trade not at 'delivered' state"
        );
        require(
            block.timestamp >= deliveryTimestamp + releaseTimeout,
            "timeout not reached"
        );

        _release();
    }

    function _release() internal nonReentrant {
        status = TradeStatus.Completed;

        uint256 sellerFee = (amount * FEE_BPS) / 10000;
        uint256 payout = amount - sellerFee;

        uint256 botFee = (sellerFee * BOT_SHARE_BPS) / TOTAL_FEE_BPS;
        uint256 receiverFee = sellerFee - botFee;

        pendingBotFee += botFee;
        pendingReceiverFee += receiverFee;

        payable(seller).transfer(amount);

        payable(bot).transfer(pendingBotFee);
        payable(feeReceiver).transfer(pendingReceiverFee);

        pendingBotFee = 0;
        pendingReceiverFee = 0;


        emit Released(seller, payout);
    }
}
