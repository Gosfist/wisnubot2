import { customerServiceService } from "../services/customer-service.service.js";
import { logger } from "../utils/logger.js";

export async function listCustomerService(req, res) {
  try {
    const items = await customerServiceService.listEntriesForUser(req.user);
    res.json({ items });
  } catch (err) {
    logger.error(err, "List customer service error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function createCustomerService(req, res) {
  try {
    const item = await customerServiceService.createEntry(req.user, {
      namaPerintah: req.body?.namaPerintah,
      value: req.body?.value,
      deliveryMode: req.body?.deliveryMode,
      price: req.body?.price,
      relayPrompt: req.body?.relayPrompt,
    });
    res.status(201).json({
      message: "Customer service berhasil dibuat",
      item,
    });
  } catch (err) {
    logger.error(err, "Create customer service error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Request tidak valid" });
  }
}

export async function updateCustomerService(req, res) {
  try {
    await customerServiceService.updateEntry(req.user, req.params.entryId, {
      namaPerintah: req.body?.namaPerintah,
      value: req.body?.value,
      deliveryMode: req.body?.deliveryMode,
      price: req.body?.price,
      relayPrompt: req.body?.relayPrompt,
    });
    res.json({ message: "Customer service berhasil diupdate" });
  } catch (err) {
    logger.error(err, "Update customer service error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Request tidak valid" });
  }
}

export async function deleteCustomerService(req, res) {
  try {
    const deleted = await customerServiceService.deleteEntry(
      req.user,
      req.params.entryId,
    );
    if (!deleted) {
      return res.status(404).json({ error: "Customer service tidak ditemukan" });
    }

    res.json({ message: "Customer service berhasil dihapus" });
  } catch (err) {
    logger.error(err, "Delete customer service error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Request tidak valid" });
  }
}
