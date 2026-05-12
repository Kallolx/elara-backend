import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Interface representing request user context
interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export const createOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { customerName, phone, address, city, shipping, total, paymentMethod, items } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized. Login is required to place an order." });
      return;
    }

    if (!customerName || !phone || !address || !city || !items || !Array.isArray(items)) {
      res.status(400).json({ success: false, message: "Missing required order checkout details." });
      return;
    }

    const order = await prisma.order.create({
      data: {
        userId,
        customerName,
        phone,
        address,
        city,
        shipping: parseFloat(shipping) || 0,
        total: parseFloat(total) || 0,
        paymentMethod: paymentMethod || "Cash on Delivery",
        items: items as any,
        status: "Pending",
      },
    });

    res.status(201).json({ success: true, data: order, message: "Order placed successfully!" });
  } catch (error: any) {
    console.error("Error creating order:", error);
    res.status(500).json({ success: false, message: "Failed to place order." });
  }
};

export const getMyOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized. Please login to view orders." });
      return;
    }

    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({ success: true, data: orders });
  } catch (error: any) {
    console.error("Error fetching my orders:", error);
    res.status(500).json({ success: false, message: "Failed to retrieve your order list." });
  }
};

export const getAllOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({ success: true, data: orders });
  } catch (error: any) {
    console.error("Error fetching all orders:", error);
    res.status(500).json({ success: false, message: "Failed to retrieve administrative order list." });
  }
};

export const updateOrderStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ success: false, message: "Missing required order status value." });
      return;
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status },
    });

    res.status(200).json({ success: true, data: updated, message: `Order status updated to ${status}.` });
  } catch (error: any) {
    console.error("Error updating order status:", error);
    res.status(500).json({ success: false, message: "Failed to update order status." });
  }
};

export const deleteOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await prisma.order.delete({
      where: { id },
    });
    res.status(200).json({ success: true, message: "Order successfully deleted permanently from records." });
  } catch (error: any) {
    console.error("Error deleting order:", error);
    res.status(500).json({ success: false, message: "Failed to delete order record." });
  }
};
