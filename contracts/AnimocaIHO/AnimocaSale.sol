// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./AnimocaHome.sol";
import "./interfaces/IAnimocaSale.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AnimocaSale is IAnimocaHome, Ownable, Pausable ,ReentrancyGuard {

  using SafeERC20 for IERC20;

  uint256 public constant BATCH_1_PRICE = 150 * (10 ** 18);
  uint256 public constant BATCH_1_SALE_PER_PACKAGE = 75; // 75 * 4
  uint256 public constant HOLDER_THRESHOLD = 1;

  uint256 public constant BATCH_2_PRICE = 222 * (10 ** 18);
  uint256 public constant BATCH_2_SALE_PER_PACKAGE = 222; // 222 * 4

  uint256 public constant BATCH_1_PENDING_BEFORE_WHITELIST = 1 days;
  uint256 public constant BATCH_2_PENDING_BEFORE_WHITELIST = 2 hours;

  uint256 public constant PURCHASE_LIMIT = 20;
  uint256 public constant PACKAGE_LIMIT = 1250;
  uint256 public constant TOTAL_PACKAGE = 4;

  IERC20 high;
  AnimocaHome animoca;
  IERC721 duck;
  uint256 packageIndex;
  uint256[2] public batch1Time;
  uint256[2] public batch2Time;
  mapping(address => bool) public batchOneWhitelist;
  mapping(address => bool) public batchTwoWhitelist;
  mapping(stageBase => uint256[TOTAL_PACKAGE]) internal PackageNumOfStage;
  mapping(uint256 => uint256) public nextIndexedId;

  event Purchase(address account, stage purchaseStage, uint256 amount, uint256[] tokenIds);
  event WithdrawHigh(address receiver, uint256 amount);
  event UpdateBatch1Time(address sender, uint256 start, uint256 end);
  event UpdateBatch2Time(address sender, uint256 start, uint256 end);

  constructor(
    IERC20 high_,
    AnimocaHome animocaNft_,
    IERC721 duck_,
    uint256[2] memory batch1Time_,
    uint256[2] memory batch2Time_
  ) {
    high = high_;
    animoca = animocaNft_;
    duck = duck_;
    setBatch1Time(batch1Time_);
    setBatch2Time(batch2Time_);
    for (uint256 i = 0; i < TOTAL_PACKAGE; ++i) {
      PackageNumOfStage[stageBase.batch1][i] = BATCH_1_SALE_PER_PACKAGE;
      PackageNumOfStage[stageBase.batch2][i] = BATCH_2_SALE_PER_PACKAGE;
    }
  }

  function isInBatch1Whitelist(address account) external view returns (bool) {
    return batchOneWhitelist[account] == true;
  }

  function isInBatch2Whitelist(address account) external view returns (bool) {
    return batchTwoWhitelist[account] == true;
  }

  function isDuckOwner(address account) public view returns (bool) {
    return duck.balanceOf(account) >= HOLDER_THRESHOLD;
  }

  function nowTimestamp() public view virtual returns (uint256) {
    return block.timestamp;
  }

  function getTokenLeft() public view returns (uint256) {
    stageBase current = getPackageStage();
    return PackageNumOfStage[current][0]
      + PackageNumOfStage[current][1]
      + PackageNumOfStage[current][2]
      + PackageNumOfStage[current][3];
  }

  function getPackageLeft(uint256 package_) public view returns (uint256) {
    stageBase current = getPackageStage();
    return PackageNumOfStage[current][package_];
  }

  function getStage() public view returns (stage) {
    uint256[2] memory batch1 = batch1Time;
    uint256[2] memory batch2 = batch2Time;

    uint256 batch1Start = batch1[0];
    uint256 batch1WhiteListEnd = batch1Start + BATCH_1_PENDING_BEFORE_WHITELIST;
    uint256 batch1End = batch1[1];

    uint256 batch2Start = batch2[0];
    uint256 batch2WhiteListEnd = batch2Start + BATCH_2_PENDING_BEFORE_WHITELIST;
    uint256 batch2End = batch2[1];

    uint256 now_ = nowTimestamp();

    if (now_ > batch2End) {
      return stage.close;
    }
    if(now_ >= batch1Start && now_ <= batch1End) {
      if(now_ < batch1WhiteListEnd) {
        return stage.batch1Whitelist;
      }
      return  stage.batch1OpenSale;
    } else if(now_ >= batch2Start && now_ <= batch2End) {
      if(now_ < batch2WhiteListEnd) {
        return stage.batch2Whitelist;
      }
      return  stage.batch2OpenSale;
    }
    return stage.notStart;
  }

  function getPackageStage() public view returns (stageBase) {
    stage current = getStage();
    if (current == stage.batch1Whitelist || current == stage.batch1OpenSale) {
      return stageBase.batch1;
    }

    if (current == stage.batch2Whitelist || current == stage.batch2OpenSale) {
      return stageBase.batch2;
    }

    return stageBase.none;
  }

  function buyBatch1Whitelist() external nonReentrant whenNotPaused {
    if (getStage() != stage.batch1Whitelist) {
      revert StageError();
    }
    if (batchOneWhitelist[msg.sender] != true) {
      revert NotInWhitelist();
    }

    high.safeTransferFrom(msg.sender, address(this), BATCH_1_PRICE);
    uint256[] memory tokenMinted = new uint256[](1);
    tokenMinted[0] = _spawnAnimocaNFT(msg.sender, getPackageStage());
    delete batchOneWhitelist[msg.sender];

    emit Purchase(msg.sender, stage.batch1Whitelist, 1, tokenMinted);
  }

  function buyBatch1OpenSale(uint256 amount) external nonReentrant whenNotPaused {
    if (amount > PURCHASE_LIMIT) {
      revert ExceedPurchaseLimit();
    }
    if (getStage() != stage.batch1OpenSale) {
      revert StageError();
    }
    // whitelist could only mint 1 token
    if (!isDuckOwner(msg.sender)) {
      revert NotQualifiedHolder();
    }

    stageBase packageStage = getPackageStage();
    uint256 left = getTokenLeft();
    uint256 toMint = (left < amount) ? left: amount;
    if (toMint == 0) { revert SaleIsOver();}
    high.safeTransferFrom(msg.sender, address(this), BATCH_1_PRICE * toMint);
    uint256[] memory tokenMinted = new uint256[](toMint);
    for (uint256 i = 0; i < toMint; ++i) {
      tokenMinted[i] = _spawnAnimocaNFT(msg.sender, packageStage);
    }

    emit Purchase(msg.sender, stage.batch1OpenSale, toMint, tokenMinted);
  }

  function buyBatch2Whitelist() external nonReentrant whenNotPaused {
    if (getStage() != stage.batch2Whitelist) {
      revert StageError();
    }
    if (batchTwoWhitelist[msg.sender] != true) {
      revert NotInWhitelist();
    }
    high.safeTransferFrom(msg.sender, address(this), BATCH_2_PRICE);
    uint256[] memory tokenMinted = new uint256[](1);
    tokenMinted[0] = _spawnAnimocaNFT(msg.sender, getPackageStage());
    delete batchTwoWhitelist[msg.sender];
    emit Purchase(msg.sender, stage.batch2Whitelist, 1, tokenMinted);
  }

  function buyBatch2OpenSale(uint256 amount) external nonReentrant whenNotPaused {
    if (amount > PURCHASE_LIMIT) {
      revert ExceedPurchaseLimit();
    }
    if (getStage() != stage.batch2OpenSale) {
      revert StageError();
    }
    stageBase packageStage = getPackageStage();
    uint256 left = getTokenLeft();
    uint256 toMint = (left < amount) ? left: amount;
    if (toMint == 0) { revert SaleIsOver();}
    high.safeTransferFrom(msg.sender, address(this), BATCH_2_PRICE * toMint);
    uint256[] memory tokenMinted = new uint256[](toMint);
    for (uint256 i = 0; i < toMint; ++i) {
      tokenMinted[i] = _spawnAnimocaNFT(msg.sender, packageStage);
    }
    emit Purchase(msg.sender, stage.batch2OpenSale, toMint, tokenMinted);
  }

  function _getPackageIndex(stageBase stage_) internal returns (uint256) {
    uint256 i = packageIndex % 4;
    uint256 count = 0;
    while(PackageNumOfStage[stage_][i] == 0) {
      if (count == TOTAL_PACKAGE) { revert SaleIsOver(); }
      i = (i + 1) % TOTAL_PACKAGE;
      count++;
    }
    packageIndex = i + 1;
    return i;
  }

  function _getTokenId(stageBase stage_, uint256 package_) internal returns (uint256 index) {
    uint256 base = package_ * PACKAGE_LIMIT;
    uint256 id = nextIndexedId[package_] ++;
    PackageNumOfStage[stage_][package_] --;
    return base + id;
  }

  function _spawnAnimocaNFT(address account_, stageBase stage_) internal returns (uint256) {
    uint256 package = _getPackageIndex(stage_);
    uint256 tokenId = _getTokenId(stage_, package);
    animoca.safeMint(account_, tokenId);
    return tokenId;
  }

  function withdrawHigh() external onlyOwner {
    uint256 balance = high.balanceOf(address(this));
    high.safeTransfer(msg.sender, balance);
    emit WithdrawHigh(msg.sender, balance);
  }

  function setBatch1Whitelist(address[] memory toAdd_, address[] memory toRemove_) external onlyOwner {
    for (uint256 i = 0; i < toAdd_.length; i++) {
      batchOneWhitelist[toAdd_[i]] = true;
    }
    for (uint256 i = 0; i < toRemove_.length; i++) {
      batchOneWhitelist[toRemove_[i]] = false;
    }
  }

  function setBatch2Whitelist(address[] memory toAdd_, address[] memory toRemove_) external onlyOwner {
    for (uint256 i = 0; i < toAdd_.length; i++) {
      batchTwoWhitelist[toAdd_[i]] = true;
    }
    for (uint256 i = 0; i < toRemove_.length; i++) {
      batchTwoWhitelist[toRemove_[i]] = false;
    }
  }

  function setBatch1Time(uint256[2] memory newTime_) public onlyOwner {
    batch1Time = newTime_;
    emit UpdateBatch1Time(msg.sender, newTime_[0], newTime_[1]);
  }

  function setBatch2Time(uint256[2] memory newTime_) public onlyOwner {
    batch2Time = newTime_;
    emit UpdateBatch2Time(msg.sender, newTime_[0], newTime_[1]);
  }

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }
}