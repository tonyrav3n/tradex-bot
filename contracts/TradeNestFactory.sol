// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./TradeNestEscrow.sol";

contract TradeNestFactory {
    TradeNestEscrow[] public escrows;
    address public bot;

    event EscrowCreated(
        address indexed escrowAddress,
        address indexed buyer,
        address indexed seller
    );

    constructor(address _bot) {
        require(_bot != address(0), "invalid bot address");
        bot = _bot;
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

        // Pass bot address into escrow
        TradeNestEscrow escrow = new TradeNestEscrow(_buyer, _seller, bot);
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
