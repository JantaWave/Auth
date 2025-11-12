import AddressModel from "../../models/address.models.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

/**
 * POST /geo/json-upload
 * Hierarchical creation endpoint using state_id, district_id, or block_id
 */
export const jsonUploadAddress = async (req, res) => {
  try {
    const { state_id, district_id, block_id, districts, blocks, villages } =
      req.body;

    // 🧭 Step 1 — Validation
    if (!state_id && !district_id && !block_id) {
      return res
        .status(400)
        .json(
          new ApiError(
            400,
            "Provide either state_id, district_id, or block_id.",
          ),
        );
    }

    const data = state_id ? districts : district_id ? blocks : villages;
    if (!data || (typeof data !== "object" && !Array.isArray(data))) {
      return res
        .status(400)
        .json(new ApiError(400, "Invalid or missing data structure."));
    }

    const createdIds = { states: [], districts: [], blocks: [], villages: [] };

    // 🏙️ CASE 1 — Add District(s), Block(s), Village(s) under a State
    if (state_id) {
      for (const [districtName, districtData] of Object.entries(data)) {
        const districtId = await AddressModel.getOrCreateDistrict(
          districtName,
          state_id,
        );
        createdIds.districts.push(districtId);

        if (districtData.blocks) {
          for (const [blockName, villages] of Object.entries(
            districtData.blocks,
          )) {
            const blockId = await AddressModel.getOrCreateBlock(
              blockName,
              districtId,
            );
            createdIds.blocks.push(blockId);

            if (Array.isArray(villages)) {
              for (const villageName of villages) {
                const villageId = await AddressModel.getOrCreateVillage(
                  villageName,
                  blockId,
                );
                createdIds.villages.push(villageId);
              }
            }
          }
        }
      }
    }

    // 🏘️ CASE 2 — Add Block(s) + Village(s) under a District
    else if (district_id) {
      for (const [blockName, villages] of Object.entries(data)) {
        const blockId = await AddressModel.getOrCreateBlock(
          blockName,
          district_id,
        );
        createdIds.blocks.push(blockId);

        if (Array.isArray(villages)) {
          for (const villageName of villages) {
            const villageId = await AddressModel.getOrCreateVillage(
              villageName,
              blockId,
            );
            createdIds.villages.push(villageId);
          }
        }
      }
    }

    // 🏡 CASE 3 — Add Villages under a Block
    else if (block_id) {
      if (!Array.isArray(data)) {
        return res
          .status(400)
          .json(new ApiError(400, "Villages must be an array"));
      }

      for (const villageName of data) {
        const villageId = await AddressModel.getOrCreateVillage(
          villageName,
          block_id,
        );
        createdIds.villages.push(villageId);
      }
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          createdIds,
          "Address hierarchy updated successfully",
        ),
      );
  } catch (error) {
    console.error("Error uploading address hierarchy:", error);
    return res
      .status(500)
      .json(
        new ApiError(
          500,
          error.message || "Failed to update address hierarchy",
        ),
      );
  }
};
