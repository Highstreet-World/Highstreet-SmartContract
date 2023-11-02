// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.9;

error NotQualifiedHolder();
error NotInWhitelist();
error NotDuringSale();
error StageError();
error SaleIsOver();
error NoPackageLeft();
error ExceedPurchaseLimit();

interface IAnimocaHome {

  enum stage {
    notStart,
    batch1Whitelist,
    batch1OpenSale,
    batch2Whitelist,
    batch2OpenSale,
    close
  }

  enum stageBase {
    none,
    batch1,
    batch2
  }

  function buyBatch1Whitelist() external;
  function buyBatch1OpenSale(uint256 amount) external;
  function buyBatch2Whitelist() external;
  function buyBatch2OpenSale(uint256 amount) external;
  function isInBatch1Whitelist(address account) external view returns (bool);
  function isInBatch2Whitelist(address account) external view returns (bool);
  function isDuckOwner(address account) external view returns (bool);
  function getStage() external view returns (stage);
  function getPackageStage() external view returns (stageBase);
  function getPackageLeft(uint256 package_) external view returns (uint256);
  function getTokenLeft() external view returns (uint256);
}