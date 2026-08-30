import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import circlesRouter from "./circles";
import attendeesRouter from "./attendees";
import meetingsRouter from "./meetings";
import goalsRouter from "./goals";
import surveysRouter from "./surveys";
import suggestionsRouter from "./suggestions";
import invitesRouter from "./invites";
import adminRouter from "./admin";
import adminAccountsRouter from "./adminAccounts";
import storageRouter from "./storage";
import hubRegistrationsRouter from "./hubRegistrations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(circlesRouter);
router.use(attendeesRouter);
router.use(meetingsRouter);
router.use(goalsRouter);
router.use(surveysRouter);
router.use(suggestionsRouter);
router.use(invitesRouter);
router.use(adminRouter);
router.use(adminAccountsRouter);
router.use(storageRouter);
router.use(hubRegistrationsRouter);

export default router;
