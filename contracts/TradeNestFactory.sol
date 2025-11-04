// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./TradeNestEscrow.sol";

contract TradeNestFactory {
    TradeNestEscrow[] public escrows;
    address public bot;
    address public feeReceiver;

    event EscrowCreated(
        address indexed escrowAddress,
        address indexed buyer,
        address indexed seller
    );

    constructor(address _bot, address _feeReceiver) {
        require(_bot != address(0), "invalid bot address");
        require(_feeReceiver != address(0), "invalid fee receiver address");
        bot = _bot;
        feeReceiver = _feeReceiver;
    }

    function setFeeReceiver(address _newReceiver) external {
        require(msg.sender == bot, "Only bot can change fee receiver");
        require(_newReceiver != address(0), "zero addr");
        feeReceiver = _newReceiver;
    }

    function createEscrow(
        address _buyer,
        address _seller
    ) external returns (address) {
        require(
            _buyer != address(0) && _seller != address(0),
            "invalid address"
        );
        require(_buyer != _seller, "buyer and seller cannot be same");

        TradeNestEscrow escrow = new TradeNestEscrow(_buyer, _seller, bot, feeReceiver);
        escrows.push(escrow);

        emit EscrowCreated(address(escrow), _buyer, _seller);
        return address(escrow);
    }

    function getAllEscrows() external view returns (TradeNestEscrow[] memory) {
        return escrows;
    }

    function getEscrow(uint256 index) external view returns (TradeNestEscrow) {
        require(index < escrows.length, "index out of range");
        return escrows[index];
    }

    function getEscrowsCount() external view returns (uint256) {
        return escrows.length;
    }
}
