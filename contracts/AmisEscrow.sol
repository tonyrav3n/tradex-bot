// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract AmisEscrowManager is ReentrancyGuard {
    uint256 public constant FEE_BPS = 250; // 2.5%
    uint256 public constant TOTAL_FEE_BPS = 500; // 5% total (2.5% buyer + 2.5% seller)
    uint256 public constant BOT_SHARE_BPS = 100; // 1%

    address public bot;
    address public feeReceiver;
    uint256 public tradeCount;

    uint256 public immutable releaseTimeout = 1 days;

    enum TradeStatus {
        Created,
        Funded,
        Delivered,
        Completed,
        Cancelled,
        Disputed
    }

    struct Trade {
        uint256 tradeId;
        address buyer;
        address seller;
        uint256 amount;
        TradeStatus status;
        uint256 deliveryTimestamp;
        uint256 pendingBotFee;
        uint256 pendingfeeReceiverFee;
    }

    mapping(uint256 => Trade) public trades;

    // --- EVENTS ---
    event Created(uint256 indexed tradeId, address indexed buyer, address indexed seller, uint256 amount);
    event Funded(uint256 indexed tradeId, address indexed buyer, uint256 amount);
    event Delivered(uint256 indexed tradeId, address indexed seller);
    event Approved(uint256 indexed tradeId, address indexed buyer);
    event Released(uint256 indexed tradeId, address indexed to, uint256 amount);
    event Disputed(uint256 indexed tradeId, address indexed raisedBy);
    event Refunded(uint256 indexed tradeId, address indexed buyer, uint256 amount);
    event Cancelled(uint256 indexed tradeId, address indexed by);
    event BuyerFeeSplit(uint256 indexed tradeId, uint256 buyerFee, uint256 botFee, uint256 feeReceiverFee);
    event SellerFeeSplit(uint256 indexed tradeId, uint256 sellerFee, uint256 botFee, uint256 feeReceiverFee);
    
    modifier onlyBot() {
        require(msg.sender == bot, "only bot can call this");
        _;
    }

    constructor(address _bot, address _feeReceiver) {
        require(_bot != address(0) && _feeReceiver != address(0), "invalid addr");
        bot = _bot;
        feeReceiver = _feeReceiver;
    }

    // --- TRADE CREATION ---
    function createTrade(address _buyer, address _seller, uint256 _amount) external onlyBot returns (uint256) {
        require(_buyer != address(0) && _seller != address(0), "invalid address");
        require(_buyer != _seller, "buyer and seller cannot be same");
        require(_amount > 0, "amount must be greater than 0");
        
        tradeCount++;
        uint256 id = tradeCount;

        trades[id] = Trade({
            tradeId: id,
            buyer: _buyer,
            seller: _seller,
            amount: _amount,
            status: TradeStatus.Created,
            deliveryTimestamp: 0,
            pendingBotFee: 0,
            pendingfeeReceiverFee: 0
        });

        emit Created(id, _buyer, _seller, _amount);
        return id;
    }

    // --- FUND ---
    function fund(uint256 tradeId) external payable nonReentrant {
        require(tradeId > 0 && tradeId <= tradeCount, "invalid trade id");

        Trade storage t = trades[tradeId];

        require(msg.sender == t.buyer, "only buyer can fund");
        require(t.status == TradeStatus.Created, "can only fund at 'created' state");

        uint256 requiredTotal = t.amount + ((t.amount * FEE_BPS) / 10000);
        require(msg.value == requiredTotal, "incorrect funding amount");

        t.status = TradeStatus.Funded;

        uint256 buyerFee = (t.amount * FEE_BPS) / 10000;
        uint256 botFee = (buyerFee * BOT_SHARE_BPS) / TOTAL_FEE_BPS;
        uint256 feeReceiverFee = buyerFee - botFee;

        t.pendingBotFee += botFee;
        t.pendingfeeReceiverFee += feeReceiverFee;

        emit BuyerFeeSplit(tradeId, buyerFee, botFee, feeReceiverFee);
        emit Funded(tradeId, t.buyer, t.amount);
    }

    // --- DELIVERY ---
    function markDelivered(uint256 tradeId) external onlyBot {
        require(tradeId > 0 && tradeId <= tradeCount, "invalid trade id");
        
        Trade storage t = trades[tradeId];

        require(t.status == TradeStatus.Funded, "can only mark delivered at 'funded' state");
        t.status = TradeStatus.Delivered;
        t.deliveryTimestamp = block.timestamp;
        emit Delivered(tradeId, t.seller);
    }

    function approveDelivery(uint256 tradeId) external onlyBot nonReentrant {
        require(tradeId > 0 && tradeId <= tradeCount, "invalid trade id");
        
        Trade storage t = trades[tradeId];

        require(t.status == TradeStatus.Delivered, "can only approve delivery at 'delivered' state");
        emit Approved(tradeId, t.buyer);
        _release(tradeId);
    }

    function releaseAfterTimeout(uint256 tradeId) external onlyBot nonReentrant {
        require(tradeId > 0 && tradeId <= tradeCount, "invalid trade id");
        
        Trade storage t = trades[tradeId];

        require(t.status == TradeStatus.Delivered, "can only auto release at 'delivered' state");
        require(block.timestamp >= t.deliveryTimestamp + releaseTimeout, "timeout not reached");
        _release(tradeId);
    }

    function _release(uint256 tradeId) internal {
        require(tradeId > 0 && tradeId <= tradeCount, "invalid trade id");
        
        Trade storage t = trades[tradeId];

        require(t.status != TradeStatus.Completed, "already completed");
        t.status = TradeStatus.Completed;

        uint256 sellerFee = (t.amount * FEE_BPS) / 10000;
        uint256 payout = t.amount - sellerFee;

        uint256 botFee = (sellerFee * BOT_SHARE_BPS) / TOTAL_FEE_BPS;
        uint256 feeReceiverFee = sellerFee - botFee;

        emit SellerFeeSplit(tradeId, sellerFee, botFee, feeReceiverFee);

        t.pendingBotFee += botFee;
        t.pendingfeeReceiverFee += feeReceiverFee;

        uint256 botAmount = t.pendingBotFee;
        uint256 receiverAmount = t.pendingfeeReceiverFee;

        t.pendingBotFee = 0;
        t.pendingfeeReceiverFee = 0;

        (bool sentSeller, ) = t.seller.call{value: payout}("");
        require(sentSeller, "seller transfer failed");

        (bool sentBot, ) = bot.call{value: botAmount}("");
        require(sentBot, "bot transfer failed");

        (bool sentFeeReceiver, ) = feeReceiver.call{value: receiverAmount}("");
        require(sentFeeReceiver, "feeReceiver transfer failed");

        emit Released(tradeId, t.seller, payout);
    }

    // --- DISPUTE ---
    function openDispute(uint256 tradeId, address raisedBy) external onlyBot {
        require(tradeId > 0 && tradeId <= tradeCount, "invalid trade id");
        
        Trade storage t = trades[tradeId];

        require(t.status == TradeStatus.Delivered, "can dispute only after delivery");
        require(raisedBy == t.buyer || raisedBy == t.seller, "invalid dispute raiser");

        t.status = TradeStatus.Disputed;
        emit Disputed(tradeId, raisedBy);
    }

    function resolveDispute(uint256 tradeId, uint256 buyerShareBps, uint256 sellerShareBps)
        external
        onlyBot
        nonReentrant
    {
        require(tradeId > 0 && tradeId <= tradeCount, "invalid trade id");
        
        Trade storage t = trades[tradeId];

        require(t.status == TradeStatus.Disputed, "not in dispute");
        require(buyerShareBps + sellerShareBps == 10000, "invalid split");

        t.status = TradeStatus.Completed;

        uint256 totalFee = (t.amount * FEE_BPS) / 10000;
        uint256 distributable = t.amount - totalFee;

        uint256 buyerPayout = (distributable * buyerShareBps) / 10000;
        uint256 sellerPayout = (distributable * sellerShareBps) / 10000;

        uint256 botFee = (totalFee * BOT_SHARE_BPS) / TOTAL_FEE_BPS;
        uint256 feeReceiverFee = totalFee - botFee;

        t.pendingBotFee += botFee;
        t.pendingfeeReceiverFee += feeReceiverFee;

        uint256 botAmount = t.pendingBotFee;
        uint256 receiverAmount = t.pendingfeeReceiverFee;

        t.pendingBotFee = 0;
        t.pendingfeeReceiverFee = 0;

        if (buyerPayout > 0) {
            (bool sentBuyer, ) = t.buyer.call{value: buyerPayout}("");
            require(sentBuyer, "buyer transfer failed");
        }
    
        if (sellerPayout > 0) {
            (bool sentSeller, ) = t.seller.call{value: sellerPayout}("");
            require(sentSeller, "seller transfer failed");
        }

        (bool sentBot, ) = bot.call{value: botAmount}("");
        require(sentBot, "bot transfer failed");

        (bool sentFeeReceiver, ) = feeReceiver.call{value: receiverAmount}("");
        require(sentFeeReceiver, "feeReceiver transfer failed");


        emit Refunded(tradeId, t.buyer, buyerPayout);
        emit Released(tradeId, t.seller, sellerPayout);
    }

    function cancelTrade(uint256 tradeId) external onlyBot {
        require(tradeId > 0 && tradeId <= tradeCount, "invalid trade id");
        
        Trade storage t = trades[tradeId];

        require(t.status == TradeStatus.Created, "can only cancel before funding");
        t.status = TradeStatus.Cancelled;
        emit Cancelled(tradeId, msg.sender);
    }
}