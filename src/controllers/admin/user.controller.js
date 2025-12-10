import AddressModel from "../../models/address.models.js";
import UserModel from "../../models/auth.models.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

export const getAuthStats = async (req, res) => {
  try {
    // Parallelize DB calls for performance
    const [villageData, userData] = await Promise.all([
      AddressModel.getAllVillagesCount(),
      UserModel.getAllUserStats(),
    ]);

    // Normalize results
    const villageCount =
      Array.isArray(villageData) && villageData[0]?.village_count
        ? parseInt(villageData[0].village_count)
        : villageData?.village_count
          ? parseInt(villageData.village_count)
          : 0;

    const userCount = {
      total: userData?.total_user ? parseInt(userData.total_user) : 0,
      leaders: userData?.total_leader ? parseInt(userData.total_leader) : 0,
    };

    const data = {
      villageCount,
      totalUsers: userCount.total,
      totalLeaders: userCount.leaders,
    };
    console.log(data);

    return res
      .status(200)
      .json(new ApiResponse(200, data, "Auth Stats fetched successfully"));
  } catch (error) {
    console.error("Error fetching stats:", error);
    const status = error.statusCode || 500;
    return res
      .status(status)
      .json(new ApiError(status, error.message || "Failed to load stats"));
  }
};

export const getAllUsers = async (req, res) => {
  try {
    // Optional filters, undefined or empty are both fine
    const searchTerm = req.query.searchTerm || "";
    const roleFilter = req.query.roleFilter || "";

    const users = await UserModel.getAllUsers(searchTerm, roleFilter);

    return res
      .status(200)
      .json(new ApiResponse(200, users, "Users fetched successfully"));
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json(new ApiError(500, "Failed to fetch users"));
  }
};
