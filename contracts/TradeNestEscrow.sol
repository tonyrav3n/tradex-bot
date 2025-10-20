// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract TradeNestEscrow {
    address public buyer;
    address public seller;
    uint256 public amount;

    enum TradeStatus {
        Created,
        Funded,
        Delivered,
        Completed,
        Cancelled,
        Disputed
    }
    TradeStatus public status;

    uint256 public deliveryTimestamp;
    uint256 public releaseTimeout = 1 days;

    // --- EVENTS ---
    event Funded(address indexed buyer, uint amount);
    event Delivered(address indexed seller);
    event Approved(address indexed buyer);
    event Released(address indexed to, uint amount);

    constructor(address _buyer, address _seller) {
        require(_buyer != _seller, "buyer and seller cannot be the same");
        buyer = _buyer;
        seller = _seller;
        status = TradeStatus.Created;
    }

    function fund() external payable {
        require(msg.sender == buyer, "only buyer can fund");
        require(status == TradeStatus.Created, "trade not at 'created' state");
        require(msg.value > 0, "must send funds");

        amount = msg.value;
        status = TradeStatus.Funded;

        emit Funded(buyer, amount);
    }

    function markDelivered() external {
        require(msg.sender == seller, "only seller");
        require(status == TradeStatus.Funded, "trade not at 'funded' state");

        status = TradeStatus.Delivered;
        deliveryTimestamp = block.timestamp;
        emit Delivered(seller);
    }

    function approveDelivery() external {
        require(msg.sender == buyer, "only buyer");
        require(
            status == TradeStatus.Delivered,
            "trade not at 'delivered' state"
        );

        emit Approved(buyer);
        _release();
    }

    function releaseAfterTimeout() external {
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

    function _release() internal {
        status = TradeStatus.Completed;
        payable(seller).transfer(amount);
        emit Released(seller, amount);
    }
}
