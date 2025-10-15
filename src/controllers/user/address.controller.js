import AddressModel from "../../models/address.models.js";

export const getAllStates = async (req, res) => {
  try {
    const states = await AddressModel.getAllStates();
    res.status(200).json({
      success: true,
      data: states,
    });
  } catch (error) {
    console.error("Error fetching states:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch states",
    });
  }
};

export const getDistrictsByState = async (req, res) => {
  try {
    const { stateId } = req.params;
    console.log(stateId);
    if (!stateId) {
      return res.status(400).json({
        success: false,
        message: "State ID is required",
      });
    }

    const districts = await AddressModel.getDistrictsByState(stateId);
    res.status(200).json({
      success: true,
      data: districts,
    });
  } catch (error) {
    console.error("Error fetching districts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch districts",
    });
  }
};

export const getBlocksByDistrict = async (req, res) => {
  try {
    const { districtId } = req.params;
    if (!districtId) {
      return res.status(400).json({
        success: false,
        message: "District ID is required",
      });
    }

    const blocks = await AddressModel.getBlocksByDistrict(districtId);
    console.log("Blocks from controller: ", blocks);
    res.status(200).json({
      success: true,
      data: blocks,
    });
  } catch (error) {
    console.error("Error fetching districts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch districts",
    });
  }
};

export const getVillagesByBlock = async (req, res) => {
  try {
    const { blockId } = req.params;
    if (!blockId) {
      return res.status(400).json({
        success: false,
        message: "Block ID is required",
      });
    }

    const villages = await AddressModel.getVillagesByBlock(blockId);
    console.log("Blocks from controller: ", villages);
    res.status(200).json({
      success: true,
      data: villages,
    });
  } catch (error) {
    console.error("Error fetching districts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch districts",
    });
  }
};
