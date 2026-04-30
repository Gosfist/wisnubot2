import { Router } from "express";
import { body } from "express-validator";
import {
  createCustomerService,
  deleteCustomerService,
  listCustomerService,
  updateCustomerService,
} from "../controllers/customer-service.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.use(authenticate);

router.get("/", listCustomerService);
router.post(
  "/",
  [
    body("namaPerintah").trim().notEmpty().withMessage("Nama perintah wajib diisi"),
    body("value").trim().notEmpty().withMessage("Value wajib diisi"),
    validate,
  ],
  createCustomerService,
);
router.put(
  "/:entryId",
  [
    body("namaPerintah").trim().notEmpty().withMessage("Nama perintah wajib diisi"),
    body("value").trim().notEmpty().withMessage("Value wajib diisi"),
    validate,
  ],
  updateCustomerService,
);
router.delete("/:entryId", deleteCustomerService);

export default router;
