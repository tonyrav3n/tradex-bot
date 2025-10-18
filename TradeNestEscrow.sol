// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TradeNestEscrow {
    address public buyer;
    address public seller;
    uint public amount;

    bool public buyerFunded;
    bool public sellerDelivered;
    bool public buyerApproved;
    bool public released;

    // --- EVENTS ---
    event Funded(address indexed buyer, uint amount);
    event Delivered(address indexed seller);
    event Approved(address indexed buyer);
    event Released(address indexed to, uint amount);

    constructor(address _seller) payable {
        buyer = msg.sender;
        seller = _seller;
        require(buyer != seller, "buyer and seller cannot be the same");
        amount = msg.value;
        require(amount > 0, "must send funds");
        buyerFunded = true;
        emit Funded(buyer, amount);
    }

    function markDelivered() external {
        require(msg.sender == seller, "only seller");
        require(!released, "already released");
        require(!sellerDelivered, "cannot redeclare delivery");
        require(buyerFunded, "no funds yet");
        sellerDelivered = true;
        emit Delivered(seller);
    }

    function approveDelivery() external {
        require(msg.sender == buyer, "only buyer");
        require(!released, "already released");
        require(sellerDelivered, "not delivered");
        buyerApproved = true;
        emit Approved(buyer);
        _release();
    }

    function _release() internal {
        released = true;
        payable(seller).transfer(amount);
        emit Released(seller, amount);
    }

    // loophole: buyer could cancel right after seller delivers

    // function cancel() external {
    //     require(!released, "already released");
    //     require(msg.sender == buyer, "only buyer");
    //     require(!sellerDelivered, "cannot cancel after delivery");
    //     released = true;
    //     payable(buyer).transfer(amount);
    // }
}
