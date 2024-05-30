// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract JuicyToken is ERC20 {
    uint256 private constant SECONDS_IN_YEAR = 365 * 24 * 60 * 60;
    uint256 private constant PRECISION_FACTOR = 1e12;

    uint256 public immutable initialSupply;
    uint256 public immutable maximumTotalSupply;
    uint256 public immutable initialMultiplier;

    uint32 public lastUpdateTimestamp;
    uint128 public accRewardsPerBalance;

    uint128 private _totalSupply;           // total supply of all minted tokens
    uint128 public totalDistributedSupply;  // `_totalSupply` + all rewards that have not been minted yet
    uint128 public totalWalletsBalance;

    struct WalletData {
        uint128 lastUpdateAccRewardsPerBalance;
        uint128 balance;
    }

    mapping(address account => WalletData) private _wallets;

    /** todo
     * @param _initialSupply Initial supply to mint
     */
    constructor(
        uint256 _initialSupply,
        uint256 _maximumTotalSupply,
        uint256 _initialMultiplier
    ) ERC20('JuicyToken', 'JT') {
        require(
            _initialSupply < type(uint128).max && _initialSupply < _maximumTotalSupply,
            "Invalid initial supply"
        );
        require(_maximumTotalSupply < type(uint128).max, "Invalid maximum supply");
        require(_initialMultiplier > 10_000, "Initial multiplier must be > 100%");

        initialMultiplier = _initialMultiplier;
        initialSupply = _initialSupply;
        maximumTotalSupply = _maximumTotalSupply;

        _mint(msg.sender, _initialSupply);
    }

    /** todo
     * @dev Transfers a `value` amount of tokens from `from` to `to`, or alternatively mints (or burns) if `from`
     * (or `to`) is the zero address. All customizations to transfers, mints, and burns should be done by overriding
     * this function.
     *
     * Emits a {Transfer} event.
     */
    function _update(address from, address to, uint256 value) internal virtual override {

        // if it's not mint or burn - try mint rewards
        if (from != address(0) && to != address(0)) {
            bool fromWallet = isWallet(from);
            bool toWallet = isWallet(to);

            _updateAccRewardsPerBalance();

            if (fromWallet) {
                _mintRewards(from);
            }

            if (toWallet) {
                _mintRewards(to);
            }
        }

        super._update(from, to, value);
    }

    /** todo
     */
    function _updateAccRewardsPerBalance() private {
        if (block.timestamp <= lastUpdateTimestamp) return;
        if (totalWalletsBalance == 0) return;

        uint256 _totalDistributedSupply = totalDistributedSupply;
        if (_totalDistributedSupply == maximumTotalSupply) return;

        // `currentMultiplier` - multiplier per year in basis points (100% = 10000) for wallet _balances
        // example: if multiplier is 150%, wallet balances will be increased by 50% per year
        // the closer `totalDistributedSupply` to `maximumTotalSupply` - the closer `currentMultiplier` will be to x1 (10_000)
        // the closer `totalDistributedSupply` to `initialSupply` - the closer `currentMultiplier` will be to `initialMultiplier`
        uint256 currentMultiplier = 10_000 + (
            (initialMultiplier - 10_000)
            * (maximumTotalSupply - _totalDistributedSupply)
            / (maximumTotalSupply - initialSupply)
        );
        // sum of minted and non-minted wallet balances are multiplied according to time passed since last update
        uint256 mintedAndDistributedWalletBalances = totalWalletsBalance + (_totalDistributedSupply - _totalSupply);
        uint256 newRewards = mintedAndDistributedWalletBalances * (currentMultiplier - 10_000)
            * (block.timestamp - lastUpdateTimestamp) / SECONDS_IN_YEAR / 10_000;

        uint256 newTotalDistributedSupply = _totalDistributedSupply + newRewards;
        if (newTotalDistributedSupply > maximumTotalSupply) {
            newTotalDistributedSupply = maximumTotalSupply;
            newRewards = newTotalDistributedSupply - _totalDistributedSupply;
        }

        // no overflow possible since we made sure amounts don't exceed maximum
        totalDistributedSupply = uint128(newTotalDistributedSupply);
        accRewardsPerBalance += uint128(newRewards * PRECISION_FACTOR / mintedAndDistributedWalletBalances);

        lastUpdateTimestamp = uint32(block.timestamp);
    }

    /**
     * @notice Mints rewards to holder wallet
     * @param account Account address
     */
    function _mintRewards(address account) internal {
        uint256 toMint = _wallets[account].balance
            * (accRewardsPerBalance - _wallets[account].lastUpdateAccRewardsPerBalance)
            / PRECISION_FACTOR;
        _wallets[account].lastUpdateAccRewardsPerBalance = accRewardsPerBalance;

        if (toMint != 0) {
            _mint(account, toMint);
        }
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