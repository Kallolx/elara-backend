import { Request, Response, NextFunction } from "express";
import prisma from "../config/database";

export const getDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      totalProducts,
      totalOrders,
      pendingOrders,
      totalCustomers,
      revenueAgg,
      recentOrdersRaw
    ] = await Promise.all([
      prisma.product.count(),
      prisma.order.count(),
      prisma.order.count({ where: { status: { in: ["Pending", "Processing"] } } }),
      prisma.user.count({ where: { role: "USER" } }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { NOT: { status: "Cancelled" } }
      }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          total: true,
          status: true,
          createdAt: true,
          customerName: true,
          items: true
        }
      })
    ]);

    const revenue = revenueAgg._sum.total || 0;

    const formattedRecentOrders = recentOrdersRaw.map((o: any) => {
      // items is stored as direct JSON column
      const itemsArray = Array.isArray(o.items) ? o.items : [];
      
      const firstItem = itemsArray.length > 0 
        ? (itemsArray[0].name || "Product") 
        : "Items not found";
      
      const extraCount = itemsArray.length > 1 ? ` (+${itemsArray.length - 1})` : "";

      return {
        id: `#EL-${o.id.toString().slice(-4).toUpperCase()}`,
        dbId: o.id,
        name: o.customerName || "Customer",
        item: `${firstItem}${extraCount}`,
        amount: `৳ ${o.total.toLocaleString()}`,
        status: o.status,
        date: o.createdAt
      };
    });

    const revenueFormatted = revenue >= 100000 
      ? `৳ ${(revenue / 100000).toFixed(2)}L` 
      : `৳ ${revenue.toLocaleString()}`;

    res.status(200).json({
      success: true,
      data: {
        overview: [
          { label: "Revenue", value: revenueFormatted, note: "Total non-cancelled orders", type: "revenue" },
          { label: "Total Orders", value: String(totalOrders), note: `${pendingOrders} pending/processing`, type: "orders" },
          { label: "Products", value: String(totalProducts), note: "Live catalog catalog count", type: "products" },
          { label: "Registered Users", value: String(totalCustomers), note: "App clients secured", type: "customers" }
        ],
        recentOrders: formattedRecentOrders
      }
    });
  } catch (error) {
    next(error);
  }
};
