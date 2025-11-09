import AddressModel from "../../models/address.models.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

// Get all states
export const getAllStates = async (req, res) => {
  try {
    const states = await AddressModel.getAllStates();
    return res
      .status(200)
      .json(new ApiResponse(200, states, "States fetched successfully"));
  } catch (error) {
    console.error("Error fetching states:", error);
    return res
      .status(error.statusCode || 500)
      .json(new ApiError(error.statusCode || 500, "Failed to fetch states"));
  }
};

// Get districts by state ID
export const getDistrictsByState = async (req, res) => {
  try {
    const { stateId } = req.params;
    if (!stateId) throw new ApiError(400, "State ID is required");

    const districts = await AddressModel.getDistrictsByState(stateId);
    return res
      .status(200)
      .json(new ApiResponse(200, districts, "Districts fetched successfully"));
  } catch (error) {
    console.error("Error fetching districts:", error);
    return res
      .status(error.statusCode || 500)
      .json(
        new ApiError(
          error.statusCode || 500,
          error.message || "Failed to fetch districts",
        ),
      );
  }
};

// Get blocks by district ID
export const getBlocksByDistrict = async (req, res) => {
  try {
    const { districtId } = req.params;
    if (!districtId) throw new ApiError(400, "District ID is required");

    const blocks = await AddressModel.getBlocksByDistrict(districtId);
    console.log("Blocks from controller:", blocks);
    return res
      .status(200)
      .json(new ApiResponse(200, blocks, "Blocks fetched successfully"));
  } catch (error) {
    console.error("Error fetching blocks:", error);
    return res
      .status(error.statusCode || 500)
      .json(
        new ApiError(
          error.statusCode || 500,
          error.message || "Failed to fetch blocks",
        ),
      );
  }
};

// Get villages by block ID
export const getVillagesByBlock = async (req, res) => {
  try {
    const { blockId } = req.params;
    if (!blockId) throw new ApiError(400, "Block ID is required");

    const villages = await AddressModel.getVillagesByBlock(blockId);
    console.log("Villages from controller:", villages);
    return res
      .status(200)
      .json(new ApiResponse(200, villages, "Villages fetched successfully"));
  } catch (error) {
    console.error("Error fetching villages:", error);
    return res
      .status(error.statusCode || 500)
      .json(
        new ApiError(
          error.statusCode || 500,
          error.message || "Failed to fetch villages",
        ),
      );
  }
};

export const getAddressByVillage = async (req, res) => {
  try {
    const { villageId } = req.params;
    if (!villageId) throw new ApiError(400, "Village ID is required");
    const address = await AddressModel.getAddressByVillageId(villageId);

    return res
      .status(200)
      .json(new ApiResponse(200, address, "Address fetched successfully"));
  } catch (error) {
    console.error("Error fetching address:", error);
    return res
      .status(error.statusCode || 500)
      .json(
        new ApiError(
          error.statusCode || 500,
          error.message || "Failed to fetch address",
        ),
      );
  }
};
