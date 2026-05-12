import bcrypt from "bcryptjs";
import prisma from "../config/database";

// Fetch all users with activity and calculated review count
export const getAllUsers = async (req: any, res: any, next: any) => {
  try {
    const users = (await (prisma as any).user.findMany({
      orderBy: { createdAt: "desc" },
    })) as any[];

    const reviews = (await (prisma as any).review.findMany({
      orderBy: { createdAt: "desc" },
    })) as any[];

    // Dynamically match user reviews and format activity logs
    const formattedUsers = users.map((user: any) => {
      const userReviews = reviews.filter(
        (r: any) => r.author.toLowerCase() === user.name.toLowerCase()
      );
      
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
        lastIp: user.lastIp,
        phone: user.phone,
        address: user.address,
        createdAt: user.createdAt,
        reviewsCount: userReviews.length,
        reviews: userReviews.map((r: any) => ({
          id: r.id,
          rating: r.rating,
          text: r.text,
          date: r.date,
        })),
      };
    });

    res.status(200).json({
      success: true,
      data: formattedUsers,
    });
  } catch (error) {
    next(error);
  }
};

// Update a user's role status (promote or demote)
export const updateUserRole = async (req: any, res: any, next: any) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || (role !== "USER" && role !== "ADMIN")) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Role must be 'USER' or 'ADMIN'.",
      });
    }

    const user = (await (prisma as any).user.findUnique({ where: { id } })) as any;
    if (!user) {
      return res.status(444).json({
        success: false,
        message: "User not found.",
      });
    }

    const updatedUser = (await (prisma as any).user.update({
      where: { id },
      data: { role },
    })) as any;

    res.status(200).json({
      success: true,
      message: `User role updated to ${role} successfully.`,
      data: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Securely delete a user account
export const deleteUser = async (req: any, res: any, next: any) => {
  try {
    const { id } = req.params;
    const requester = req.user;

    // Allow deletion only if requester is an admin or the account owner
    if (!requester || (requester.role !== "ADMIN" && requester.id !== id)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized action.",
      });
    }

    const user = (await (prisma as any).user.findUnique({ where: { id } })) as any;
    if (!user) {
      return res.status(444).json({
        success: false,
        message: "User not found.",
      });
    }

    await (prisma as any).user.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: "Account successfully deleted.",
    });
  } catch (error) {
    next(error);
  }
};

// Securely update a user profile (Name, Password, Phone, Address)
export const updateUserProfile = async (req: any, res: any, next: any) => {
  try {
    const { id } = req.params;
    const requester = req.user;

    // Allow updates only if the requester is an admin or the account owner
    if (!requester || (requester.role !== "ADMIN" && requester.id !== id)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized action.",
      });
    }

    const { name, password, currentPassword, phone, address } = req.body;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;

    if (password) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password is required to set a new password.",
        });
      }

      const user = await (prisma as any).user.findUnique({ where: { id } });
      if (!user) {
        return res.status(444).json({
          success: false,
          message: "User not found.",
        });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect.",
        });
      }

      updateData.password = await bcrypt.hash(password, 12);
    }

    const updatedUser = (await (prisma as any).user.update({
      where: { id },
      data: updateData,
    })) as any;

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        phone: updatedUser.phone,
        address: updatedUser.address,
      },
    });
  } catch (error) {
    next(error);
  }
};
