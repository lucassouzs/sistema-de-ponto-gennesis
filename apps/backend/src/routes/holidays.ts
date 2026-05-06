import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { HolidayController } from '../controllers/HolidayController';

const router = express.Router();
const holidayController = new HolidayController();

// Rotas públicas (não precisam de autenticação)
router.get('/check', (req, res, next) => holidayController.checkIsHoliday(req, res, next));
router.get('/period', (req, res, next) => holidayController.getHolidaysByPeriod(req, res, next));
router.get('/working-days', (req, res, next) => holidayController.countWorkingDays(req, res, next));

// Rotas que precisam de autenticação
router.use(authenticate);

// CRUD de feriados
router.post('/', authorize('EMPLOYEE'), (req, res, next) => holidayController.createHoliday(req, res, next));
router.get('/', (req, res, next) => holidayController.getHolidays(req, res, next));
router.get('/:id', (req, res, next) => holidayController.getHolidayById(req, res, next));
router.put('/:id', authorize('EMPLOYEE'), (req, res, next) => holidayController.updateHoliday(req, res, next));
router.delete('/:id', authorize('EMPLOYEE'), (req, res, next) => holidayController.deleteHoliday(req, res, next));

// Importação e geração de feriados
router.post('/import/national', authorize('EMPLOYEE'), (req, res, next) => holidayController.importNationalHolidays(req, res, next));
router.post('/generate/recurring', authorize('EMPLOYEE'), (req, res, next) => holidayController.generateRecurringHolidays(req, res, next));

export default router;

