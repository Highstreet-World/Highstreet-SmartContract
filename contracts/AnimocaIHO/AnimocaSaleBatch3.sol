// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./AnimocaHome.sol";
import "./interfaces/IAnimocaSaleBatch3.sol";
import "../common/PriceConverter.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract AnimocaSaleBatch3 is IAnimocaSaleBatch3, Ownable2Step, Pausable, PriceConverter ,ReentrancyGuard {

  using SafeERC20 for IERC20;
  using Address for address;

  uint256 public constant BATCH_3_PRICE = 300 * (10 ** 18);
  uint256 public constant DUCK_HOLDER_PRICE = 255 * (10 ** 18); 
  uint256 public constant BATCH_3_LIST_DISCOUNT = 30 * (10 ** 18);
  uint256 public constant ETH_PAYMENT_FEE = 110;
  uint256 public constant PACKAGE_MAX_TOKENID = 1250;
  uint256 public constant PACKAGE_RESERVE_BIAS = 53;
  uint256 public constant PURCHASE_LIMIT = 20;
  uint256 public constant TOTAL_PACKAGE = 4;
  uint8 public constant CONST_EXCHANGE_RATE_DECIMAL = 18;

  address public immutable highUsdPriceFeed;
  address public immutable ethUsdPriceFeed;

  struct EventPackage {
    uint256 index;
    uint256 startingIndex;
    uint256 amount;
  }

  IERC20 public high;
  IERC721 public duck;
  AnimocaHome public animoca;
  address public receiver;
  uint256[2] public batch3Time;
  mapping(uint256 => uint256) internal packageNextId;
  mapping(address => bool) internal discount;

  event Purchase(address indexed account, EventPackage[] packages, uint256 fee, bool isPaidByEth);
  event UpdateBatch3Time(address sender, uint256 start, uint256 end);
  event UpdateReceiver(address oldReceiver, address newReceiver);

  constructor(
    IERC20 high_,
    IERC721 duck_,
    AnimocaHome animocaNft_,
    address receiver_,
    address highUsdPriceFeed_,
    address ethUsdPriceFeed_,
    uint256[2] memory batch3Time_,
    uint256[4] memory packageStartingIndex_
  ) {
    high = high_;
    duck = duck_;
    animoca = animocaNft_;
    receiver = receiver_;
    highUsdPriceFeed = highUsdPriceFeed_;
    ethUsdPriceFeed = ethUsdPriceFeed_;
    setBatch3Time(batch3Time_);
    for (uint256 i = 0; i < TOTAL_PACKAGE; ++i) {
      packageNextId[i] = packageStartingIndex_[i];
    }
  }

  function buyBatch3OpenSale(Package[] memory packages_) external payable nonReentrant whenNotPaused {
    require(isOpened() == true, "sale isn't open");
    require(packages_.length <= TOTAL_PACKAGE, "invalid input length");

    address sender = _msgSender();
    uint256 totalFee;
    uint256 totalAmount;
    uint256 length = packages_.length;
    EventPackage[] memory mintInfo = new EventPackage[](length);

    // gas optimization
    {
      uint256 packageIndex;
      uint256 amount;
      uint256 tokenLeft;
      uint256 nextId;
      uint256 toMint;

      for (uint256 i = 0; i < length; ++i) {
        packageIndex = packages_[i].index;
        amount = packages_[i].amount;
        tokenLeft = getPackageLeft(packageIndex);
        nextId = packageNextId[packageIndex];
        toMint = (tokenLeft > amount) ? amount : tokenLeft;
        totalAmount += toMint;
        require(totalAmount <= PURCHASE_LIMIT, "exceed purchase limit");
        require(tokenLeft > 0, "package sale is over");
        for (uint256 j = 0; j < toMint; ++j) {
          animoca.safeMint(sender, nextId + j);
        }
        packageNextId[packageIndex] += toMint;
        mintInfo[i] = EventPackage({
          index: packageIndex,
          startingIndex: nextId,
          amount: toMint
        });
      }
    }

    bool isPaidByEth = (msg.value > 0) ? true : false;
    if (isPaidByEth) {
      totalFee = getPriceInEth(sender, totalAmount);
      require(msg.value >= totalFee, "insufficient eth");
      uint256 reimburse = msg.value - totalFee;
      Address.sendValue(payable(receiver), totalFee);
      Address.sendValue(payable(sender), reimburse);
    } else {
      totalFee = getPriceInHigh(sender, totalAmount);
      high.safeTransferFrom(sender, receiver, totalFee);
    }

    if (discount[sender]) {
      delete discount[sender];
    }

    emit Purchase(sender, mintInfo, totalFee, isPaidByEth);
  }

  function nowTimestamp() public view virtual returns (uint256) {
    return block.timestamp;
  }
  
  function isOpened() public view returns (bool) {
    uint256 now_ = nowTimestamp();
    if (now_ >= batch3Time[0] && now_ <= batch3Time[1]) {
      return true;
    }
    return false;
  }

  function getTokenLeft() public view returns (uint256 left) {
    for (uint256 i = 0; i < TOTAL_PACKAGE; ++i) {
      left += getPackageLeft(i);
    }
  }

  function getPackageLeft(uint256 package_) public view returns (uint256) {
    if (package_ >= TOTAL_PACKAGE) {
      return 0;
    }
    return PACKAGE_MAX_TOKENID * (package_ + 1) - PACKAGE_RESERVE_BIAS - packageNextId[package_];
  }

  function hasDiscount(address account) public view returns (bool) {
    return discount[account];
  }

  function setDiscount(address[] memory toAdd_, address[] memory toRemove_) external onlyOwner {
    for (uint256 i; i < toAdd_.length; ++i) {
      discount[toAdd_[i]] = true;
    }
    for (uint256 i; i < toRemove_.length; ++i) {
      discount[toRemove_[i]] = false;
    }
  }

  function setBatch3Time(uint256[2] memory newTime_) public onlyOwner {
    batch3Time = newTime_;
    emit UpdateBatch3Time(_msgSender(), newTime_[0], newTime_[1]);
  }

  function setReceiver(address newReceiver_) external onlyOwner {
    address oldReceiver = receiver;
    receiver = newReceiver_;
    emit UpdateReceiver(oldReceiver, newReceiver_);
  }

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  function exchangeToETH(uint256 value) internal view virtual returns (uint256) {
    int256 rate = getDerivedPrice(highUsdPriceFeed, ethUsdPriceFeed, CONST_EXCHANGE_RATE_DECIMAL);
    require(rate > 0, "invalid exchange rate");
    return value * uint256(rate) / 10 ** uint256(CONST_EXCHANGE_RATE_DECIMAL);
  }

  function getPriceInEth(address account, uint256 amount) public view returns (uint256) {
    uint256 price = duck.balanceOf(account) > 0 ? DUCK_HOLDER_PRICE : BATCH_3_PRICE;
    price *= amount;
    if (discount[account]) price -= BATCH_3_LIST_DISCOUNT;
    return exchangeToETH(price * ETH_PAYMENT_FEE / 100);
  }

  function getPriceInHigh(address account, uint256 amount) public view returns (uint256) {
    uint256 price = duck.balanceOf(account) > 0 ? DUCK_HOLDER_PRICE : BATCH_3_PRICE;
    price *= amount;
    if (discount[account]) price -= BATCH_3_LIST_DISCOUNT;
    return price;
  }
}