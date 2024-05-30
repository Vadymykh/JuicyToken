// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "hardhat/console.sol"; // todo fixme

contract JuicyToken is ERC20 {
    uint256 private constant SECONDS_IN_YEAR = 365 * 24 * 60 * 60;
    uint256 private constant PRECISION_FACTOR = 1e12;

    uint256 public immutable INITIAL_SUPPLY;
    uint256 public immutable MAXIMUM_TOTAL_SUPPLY;
    uint256 public immutable INITIAL_MULTIPLIER;

    uint128 private _totalSupply;           // total supply of all minted tokens
    uint128 public accRewardsPerBalance;    // accrued rewards per wallet balance
    uint112 public distributedRewards;  // all rewards that have not been minted yet
    uint112 public walletBalancesSum;     // sum of minted tokens that belong to non-contracts
    uint32 public lastUpdateTimestamp;

    struct AccountData {
        uint128 lastUpdateAccRewardsPerBalance;
        uint112 balance;
        // Edge case attribute. For cases when address received tokens and then smart contract was deployed to this address
        bool isContract;
    }

    mapping(address account => AccountData) private _accounts;

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

        lastUpdateTimestamp = uint32(block.timestamp);

        _mint(msg.sender, initialSupply);
    }

    /**
     * @return multiplier per year in basis points (100% = 10000) for wallet _balances
     * example: if multiplier is 150%, wallet balances will be increased by 50% per year
     * the closer `totalDistributedSupply` to `maximumTotalSupply` - the closer `currentMultiplier` will be to x1 (10_000)
     * the closer `totalDistributedSupply` to `initialSupply` - the closer `currentMultiplier` will be to `initialMultiplier`
     */
    function getCurrentMultiplier() external view returns (uint256) {
        uint256 _totalDistributedSupply = _totalSupply + distributedRewards;
        return 10_000 + (
            (INITIAL_MULTIPLIER - 10_000)
            * (MAXIMUM_TOTAL_SUPPLY - _totalDistributedSupply)
            / (MAXIMUM_TOTAL_SUPPLY - INITIAL_SUPPLY)
        );
    }

    /**
     * @notice Estimates current balance + earned rewards
     * @param account Account address
     * @return Current balance + earned rewards
     */
    function pendingBalanceOf(address account) external view returns (uint256) {
        bool isWallet = !_accounts[account].isContract && _isWallet(account);
        if (!isWallet) return _accounts[account].balance;

        uint128 _accRewardsPerBalance = accRewardsPerBalance;
        if (block.timestamp > lastUpdateTimestamp && walletBalancesSum != 0) {
            (, uint128 accRewardsPerBalanceToAdd) = _getNewRewardsData();
            _accRewardsPerBalance += accRewardsPerBalanceToAdd;
        }

        uint256 pendingRewards = _accounts[account].balance
            * (_accRewardsPerBalance - _accounts[account].lastUpdateAccRewardsPerBalance)
            / PRECISION_FACTOR;

        return _accounts[account].balance + pendingRewards;
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
        bool fromWallet = !_accounts[from].isContract && _checkWallet(from);
        bool toWallet = !_accounts[to].isContract && _checkWallet(to);

        // gas saving
        uint112 _walletBalancesSum = walletBalancesSum;

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
                _walletBalancesSum += minted;
                distributedRewards -= minted;
            }
        }

        if (from != address(0) && fromWallet) {
            _walletBalancesSum -= amount;
        }

        if (to != address(0) && toWallet) {
            _walletBalancesSum += amount;
        }

        walletBalancesSum = _walletBalancesSum;

        // updated original math
        if (from == address(0)) {
            // Overflow check required: The rest of the code assumes that totalSupply never overflows
            _totalSupply += amount;
        } else {
            uint112 fromBalance = _accounts[from].balance;
            if (fromBalance < amount) {
                revert ERC20InsufficientBalance(from, fromBalance, amount);
            }
            unchecked {
            // Overflow not possible: amount <= fromBalance <= totalSupply.
                _accounts[from].balance = fromBalance - amount;
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
                _accounts[to].balance += amount;
            }
        }

        emit Transfer(from, to, value);
    }

    /**
     * @notice Updates global rewards distribution values
     */
    function _updateAccRewardsPerBalance() private {
        if (block.timestamp <= lastUpdateTimestamp) return;
        if (walletBalancesSum == 0) {
            lastUpdateTimestamp = uint32(block.timestamp);
            return;
        }

        (uint112 rewardsToDistribute, uint128 accRewardsPerBalanceToAdd) = _getNewRewardsData();

        if (rewardsToDistribute != 0) distributedRewards += rewardsToDistribute;
        if (accRewardsPerBalanceToAdd != 0) accRewardsPerBalance += accRewardsPerBalanceToAdd;

        lastUpdateTimestamp = uint32(block.timestamp);
    }

    /**
     * @return rewardsToDistribute Rewards to distribute
     * @return accRewardsPerBalanceToAdd Accrued rewards per balance to add
     */
    function _getNewRewardsData() private view returns (
        uint112 rewardsToDistribute, uint128 accRewardsPerBalanceToAdd
    ) {
        uint256 _distributedRewards = distributedRewards;
        uint256 _totalDistributedSupply = _totalSupply + distributedRewards;
        if (_totalDistributedSupply == MAXIMUM_TOTAL_SUPPLY) return (0, 0);

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
        uint256 mintedAndDistributedWalletBalances = walletBalancesSum + _distributedRewards;
        uint256 newRewards = mintedAndDistributedWalletBalances * (currentMultiplier - 10_000)
            * (block.timestamp - lastUpdateTimestamp) / SECONDS_IN_YEAR / 10_000;

        uint256 newTotalDistributedSupply = _totalDistributedSupply + newRewards;
        if (newTotalDistributedSupply > MAXIMUM_TOTAL_SUPPLY) {
            newTotalDistributedSupply = MAXIMUM_TOTAL_SUPPLY;
            newRewards = newTotalDistributedSupply - _totalDistributedSupply;
        }

        // no overflow possible since we made sure amounts don't exceed maximum
        return (uint112(newRewards), uint128(newRewards * PRECISION_FACTOR / mintedAndDistributedWalletBalances));
    }

    /**
     * @notice Mints rewards to holder wallet
     * @param account Account address
     * @return Amount minted
     */
    function _mintRewards(address account) internal returns (uint112) {
        uint256 toMint = _accounts[account].balance
            * (accRewardsPerBalance - _accounts[account].lastUpdateAccRewardsPerBalance)
            / PRECISION_FACTOR;
        _accounts[account].lastUpdateAccRewardsPerBalance = accRewardsPerBalance;

        if (toMint != 0) {
            _mint(account, toMint);
        }

        return SafeCast.toUint112(toMint);
    }

    /**
     * @notice Checks if address is a wallet (not a smart contract)
     * @param account Address to check
     * @return isWallet `true` - account is wallet address
     * @dev Marks account as `isContract`.
     */
    function _checkWallet(address account) internal returns (bool isWallet){
        isWallet = _isWallet(account);

        // account is smart contract
        if (!isWallet) {
            _accounts[account].isContract = true;
            // edge case
            // if address became smart contract we don't want to distribute rewards for it anymore
            if (_accounts[account].balance != 0) {
                walletBalancesSum -= _accounts[account].balance;
            }
        }
    }

    /**
     * @notice Checks if address is a wallet (not a smart contract)
     * @param account Address to check
     * @return isWallet `true` - account is wallet address
     */
    function _isWallet(address account) internal view returns (bool isWallet){
        uint32 size;
        assembly {
            size := extcodesize(account)
        }
        isWallet = (size == 0);
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
        return _accounts[account].balance;
    }
}