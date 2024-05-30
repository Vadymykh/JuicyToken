// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

contract JuicyToken is ERC20 {
    uint256 private constant SECONDS_IN_YEAR = 365 * 24 * 60 * 60;
    uint256 private constant PRECISION_FACTOR = 1e12;

    uint256 public immutable INITIAL_SUPPLY;
    uint256 public immutable MAXIMUM_TOTAL_SUPPLY;
    uint256 public immutable INITIAL_MULTIPLIER;

    uint128 private _totalSupply;           // total supply of all minted tokens
    uint128 public accRewardsPerBalance;    // accrued rewards per wallet balance
    uint112 public totalDistributedSupply;  // `_totalSupply` + all rewards that have not been minted yet
    uint112 public totalWalletsBalance;     // sum of minted tokens that belong to non-contracts
    uint32 public lastUpdateTimestamp;

    struct WalletData {
        uint128 lastUpdateAccRewardsPerBalance;
        uint128 balance;
    }

    mapping(address account => WalletData) private _wallets;

    /**
     * @param initialSupply Initial supply to mint
     * @param maximumTotalSupply Maximum allowed total supply
     * @param initialMultiplier Initial yearly wallet balances multiplier (in basis points 100% = 10000)
     * Example 20000 will mean initially wallet balances will double per year
     * The the more rewards will be minted, the closer active multiplier will be to 100% (x1 = no rewards minted)
     */
    constructor(
        uint256 initialSupply,
        uint256 maximumTotalSupply,
        uint256 initialMultiplier
    ) ERC20('JuicyToken', 'JT') {
        require(
            initialSupply < type(uint112).max && initialSupply < maximumTotalSupply,
            "Invalid initial supply"
        );
        require(maximumTotalSupply < type(uint112).max, "Invalid maximum supply");
        require(initialMultiplier > 10_000, "Initial multiplier must be > 100%");

        INITIAL_MULTIPLIER = initialMultiplier;
        INITIAL_SUPPLY = initialSupply;
        MAXIMUM_TOTAL_SUPPLY = maximumTotalSupply;

        _mint(msg.sender, initialSupply);
    }

    /**
     * @notice Updates wallets' and global variables during token transfer
     * @param from Transfer source
     * @param to Transfer destination
     * @param value Amount to transfer
     * @dev Original function override. Mints rewards for wallet accounts
     */
    function _update(address from, address to, uint256 value) internal virtual override {
        uint112 amount = SafeCast.toUint112(value);
        bool fromWallet = isWallet(from);
        bool toWallet = isWallet(to);

        // gas saving
        uint112 _totalWalletsBalance = totalWalletsBalance;

        // if it's not mint or burn - try mint rewards
        if (from != address(0) && to != address(0)) {
            _updateAccRewardsPerBalance();

            uint112 minted = 0;
            if (fromWallet) {
                minted += _mintRewards(from);
            }

            if (toWallet) {
                minted += _mintRewards(to);
            }

            if (minted != 0) {
                _totalWalletsBalance += minted;
            }
        }

        if (fromWallet) {
            _totalWalletsBalance -= amount;
        }

        if (toWallet) {
            _totalWalletsBalance += amount;
        }

        totalWalletsBalance = _totalWalletsBalance;

        // updated original math
        if (from == address(0)) {
            // Overflow check required: The rest of the code assumes that totalSupply never overflows
            _totalSupply += amount;
        } else {
            uint128 fromBalance = _wallets[from].balance;
            if (fromBalance < amount) {
                revert ERC20InsufficientBalance(from, fromBalance, amount);
            }
            unchecked {
            // Overflow not possible: amount <= fromBalance <= totalSupply.
                _wallets[from].balance = fromBalance - amount;
            }
        }

        if (to == address(0)) {
            unchecked {
            // Overflow not possible: amount <= totalSupply or amount <= fromBalance <= totalSupply.
                _totalSupply -= amount;
            }
        } else {
            unchecked {
            // Overflow not possible: balance + amount is at most totalSupply, which we know fits into a uint256.
                _wallets[to].balance += amount;
            }
        }

        emit Transfer(from, to, value);
    }

    /**
     * @notice Updates global rewards distribution values
     */
    function _updateAccRewardsPerBalance() private {
        if (block.timestamp <= lastUpdateTimestamp) return;
        if (totalWalletsBalance == 0) {
            lastUpdateTimestamp = uint32(block.timestamp);
            return;
        }

        uint256 _totalDistributedSupply = totalDistributedSupply;
        if (_totalDistributedSupply == MAXIMUM_TOTAL_SUPPLY) return;

        // `currentMultiplier` - multiplier per year in basis points (100% = 10000) for wallet _balances
        // example: if multiplier is 150%, wallet balances will be increased by 50% per year
        // the closer `totalDistributedSupply` to `maximumTotalSupply` - the closer `currentMultiplier` will be to x1 (10_000)
        // the closer `totalDistributedSupply` to `initialSupply` - the closer `currentMultiplier` will be to `initialMultiplier`
        uint256 currentMultiplier = 10_000 + (
            (INITIAL_MULTIPLIER - 10_000)
            * (MAXIMUM_TOTAL_SUPPLY - _totalDistributedSupply)
            / (MAXIMUM_TOTAL_SUPPLY - INITIAL_SUPPLY)
        );
        // sum of minted and non-minted wallet balances are multiplied according to time passed since last update
        uint256 mintedAndDistributedWalletBalances = totalWalletsBalance + (_totalDistributedSupply - _totalSupply);
        uint256 newRewards = mintedAndDistributedWalletBalances * (currentMultiplier - 10_000)
            * (block.timestamp - lastUpdateTimestamp) / SECONDS_IN_YEAR / 10_000;

        uint256 newTotalDistributedSupply = _totalDistributedSupply + newRewards;
        if (newTotalDistributedSupply > MAXIMUM_TOTAL_SUPPLY) {
            newTotalDistributedSupply = MAXIMUM_TOTAL_SUPPLY;
            newRewards = newTotalDistributedSupply - _totalDistributedSupply;
        }

        // no overflow possible since we made sure amounts don't exceed maximum
        totalDistributedSupply = uint112(newTotalDistributedSupply);
        accRewardsPerBalance += uint112(newRewards * PRECISION_FACTOR / mintedAndDistributedWalletBalances);

        lastUpdateTimestamp = uint32(block.timestamp);
    }

    /**
     * @notice Mints rewards to holder wallet
     * @param account Account address
     * @return Amount minted
     */
    function _mintRewards(address account) internal returns(uint112) {
        uint256 toMint = _wallets[account].balance
            * (accRewardsPerBalance - _wallets[account].lastUpdateAccRewardsPerBalance)
            / PRECISION_FACTOR;
        _wallets[account].lastUpdateAccRewardsPerBalance = accRewardsPerBalance;

        if (toMint != 0) {
            _mint(account, toMint);
        }

        return SafeCast.toUint112(toMint);
    }

    /**
     * @notice Checks if address is a wallet (not a smart contract)
     * @param _addr Address to check
     * @return isContract `true` - _addr is smart contract address
     */
    function isWallet(address _addr) internal view returns (bool isContract){
        uint32 size;
        assembly {
            size := extcodesize(_addr)
        }
        return (size == 0);
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) public view virtual override returns (uint256) {
        return _wallets[account].balance;
    }
}