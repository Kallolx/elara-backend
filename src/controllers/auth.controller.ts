import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../config/database";

const JWT_SECRET = process.env.JWT_SECRET || "9a4b3d8c1e7f6a2b5c0e8d9a7f3c1b5a2e4d6f8a9c0b1d3e5f7a2c4e6b8d0a2c";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// Secure user registration
export const signup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User with this email already exists" });
    }

    // Hash password securely (12 salt rounds)
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role === "ADMIN" ? "ADMIN" : "USER",
      },
      include: {
        wishlist: { select: { id: true } }
      }
    });

    // Create JWT Token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          wishlistIds: user.wishlist.map((p) => p.id)
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Secure user login
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const user = await prisma.user.findUnique({ 
      where: { email },
    });
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    // Capture Client IP Address securely
    const rawIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || req.ip || "127.0.0.1";
    let ipString = typeof rawIp === "string" ? rawIp.split(",")[0].trim() : "127.0.0.1";
    if (ipString === "::1" || ipString === "::ffff:127.0.0.1") {
      ipString = "127.0.0.1";
    }

    // Update user login history in database and fetch full wishlist
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        lastIp: ipString,
      },
      include: {
        wishlist: { select: { id: true } }
      }
    });

    // Sign JWT Token
    const token = jwt.sign(
      { id: updatedUser.id, email: updatedUser.email, role: updatedUser.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          lastLogin: updatedUser.lastLogin,
          lastIp: updatedUser.lastIp,
          wishlistIds: updatedUser.wishlist.map((p) => p.id)
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
