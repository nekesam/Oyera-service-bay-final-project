import Stock from '../models/Stock.mjs';
import { dashboardPermissionsByRole } from './dashboardControllers.mjs';
import { sanitizeStockPayload } from '../Validation/userValidation.mjs';
import { setFlash } from '../utils/flash.mjs';
import { audit } from '../services/auditService.mjs';
import { clearNotificationCache } from '../services/notificationService.mjs';
import { whyStockCannotBeDeleted } from '../services/deletionGuards.mjs';
import { isLowStock } from '../services/inventoryService.mjs';

const withLowFlag = (items) => items.map((item) => ({ ...item, isLow: isLowStock(item) }));

const getRolePermissions = (role) => {
	return dashboardPermissionsByRole[role] || dashboardPermissionsByRole.Technician;
};

const canManageStockByRole = (role) => role === 'Admin' || role === 'Senior technician';

const defaultRegisterStockData = {
	stockId: '',
	itemName: '',
	category: '',
	supplier: '',
	quantity: '',
	unit: '',
	unitPrice: '',
	date: '',
	storageLocation: '',
	description: '',
};

const defaultQuickStockData = {
	itemName: '',
	category: '',
	price: '',
	quantity: '',
};

export const getStockPage = (req, res) => {
	const role = req.session?.userRole;
	res.render('registerStock', {
		permissions: getRolePermissions(role),
		canManageStock: canManageStockByRole(role),
		formData: defaultRegisterStockData,
		errorMessage: null,
	});
};

export const getStockRecordsPage = async (req, res) => {
	try {
		const allStock = withLowFlag(await Stock.find({}).sort({ createdAt: -1 }).lean());
		const role = req.session?.userRole;
		res.render('stockList', {
			allStock,
			permissions: getRolePermissions(role),
			canManageStock: canManageStockByRole(role),
		});
	} catch (error) {
		console.error(error);
		res.status(500).send('Failed to load stock records.');
	}
};

export const createStockItem = async (req, res) => {
	try {
		const cleaned = sanitizeStockPayload(req.body);
		if (req.stockValidationErrors?.length) {
			const role = req.session?.userRole;
			return res.status(400).render('registerStock', {
				permissions: getRolePermissions(role),
				canManageStock: canManageStockByRole(role),
				formData: {
					...defaultRegisterStockData,
					...cleaned,
				},
				errorMessage: req.stockValidationErrors.join(' '),
			});
		}

		const newStock = new Stock({
			...cleaned,
			stockId: cleaned.stockId || `STK-${Date.now()}`,
			registeredBy: req.session.userId
		});
		await newStock.save();
		console.log(newStock);
		await audit(req, { action: 'created', entity: 'Stock', entityId: newStock._id, summary: `Added stock item "${newStock.itemName}" (${newStock.quantity} @ UGX ${Number(newStock.unitPrice).toLocaleString('en-US')}).` });
		clearNotificationCache();
		setFlash(req, `Stock item "${newStock.itemName}" added successfully.`);
	    res.redirect('/registerStock/stockList');
	} catch (error) {
		console.error(error);
		const role = req.session?.userRole;
		const duplicateEntry = error?.code === 11000;
		const cleaned = sanitizeStockPayload(req.body);
		res.status(400).render('registerStock', {
			permissions: getRolePermissions(role),
			canManageStock: canManageStockByRole(role),
			formData: {
				...defaultRegisterStockData,
				...cleaned,
			},
			errorMessage: duplicateEntry
				? 'Stock ID already exists. Use a different one or leave it blank for auto-generation.'
				: 'Failed to add stock item. Check your input values and try again.',
		});
	}
};

export const getStockForm = (req, res) => {
	const role = req.session?.userRole;
	res.render('addStock', {
		permissions: getRolePermissions(role),
		canManageStock: canManageStockByRole(role),
		formData: defaultQuickStockData,
		errorMessage: null,
	});
};

export const addStock = async (req, res) => {
	try {
		const cleaned = sanitizeStockPayload(req.body);
		if (req.stockValidationErrors?.length) {
			const role = req.session?.userRole;
			return res.status(400).render('addStock', {
				permissions: getRolePermissions(role),
				canManageStock: canManageStockByRole(role),
				formData: {
					...defaultQuickStockData,
					itemName: cleaned.itemName,
					category: cleaned.category,
					price: cleaned.unitPrice,
					quantity: cleaned.quantity,
				},
				errorMessage: req.stockValidationErrors.join(' '),
			});
		}

		const payload = {
			...cleaned,
			registeredBy: req.session.userId,
			stockId: cleaned.stockId || `STK-${Date.now()}`,
			unitPrice: cleaned.unitPrice
		};

		const newStock = new Stock(payload);
		await newStock.save();
		await audit(req, { action: 'created', entity: 'Stock', entityId: newStock._id, summary: `Added stock item "${newStock.itemName}" (${newStock.quantity} @ UGX ${Number(newStock.unitPrice).toLocaleString('en-US')}).` });
		clearNotificationCache();
		setFlash(req, `Stock item "${newStock.itemName}" added successfully.`);
		res.redirect('/registerStock/stockList');
	} catch (error) {
		console.error(error);
		const role = req.session?.userRole;
		const duplicateEntry = error?.code === 11000;
		const cleaned = sanitizeStockPayload(req.body);
		res.status(400).render('addStock', {
			permissions: getRolePermissions(role),
			canManageStock: canManageStockByRole(role),
			formData: {
				...defaultQuickStockData,
				itemName: cleaned.itemName,
				category: cleaned.category,
				price: cleaned.unitPrice,
				quantity: cleaned.quantity,
			},
			errorMessage: duplicateEntry
				? 'Stock ID already exists. Try again.'
				: 'Error adding stock. Check your input values and try again.',
		});
	}
}

// get all stock from the DB
export const getAllStock = async(req, res) =>{
	try {
		const allStock = withLowFlag(await Stock.find()
			.sort({ createdAt: -1 }).lean());
		const role = req.session?.userRole;
		res.render('stockList', {
			allStock,
			permissions: getRolePermissions(role),
			canManageStock: canManageStockByRole(role),
		})
	} catch (error) {
	   console.error('Error fetching stock', error) 
	   res.status(500).send('Error fetching stock')
	}
}

export const getEditStockForm = async (req, res) => {
    try {
        const stock = await Stock.findById(req.params.id).lean();

        if (!stock) {
            return res.status(404).send('Stock item not found');
        }

        const role = req.session?.userRole;

        res.render('editStock', {
            stock,
            permissions: getRolePermissions(role),
            canManageStock: canManageStockByRole(role),
            errorMessage: null,
        });
    } catch (error) {
        console.error('Error loading editStockForm', error);
        res.status(500).send('Error loading Edit Stock Form');
    }
};

export const updateStock = async (req, res) => {
    try {
        const cleaned = sanitizeStockPayload(req.body);

        const role = req.session?.userRole;

        // Check validation errors
        if (req.stockValidationErrors?.length) {
            const stock = await Stock.findById(req.params.id).lean();

            return res.status(400).render('editStock', {
                stock: {
                    ...(stock || {}),
                    ...cleaned,
                },
                permissions: getRolePermissions(role),
                canManageStock: canManageStockByRole(role),
                errorMessage: req.stockValidationErrors.join(' '),
            });
        }

        // Update stock
        await Stock.findByIdAndUpdate(
            req.params.id,
            {
                itemName: cleaned.itemName,
                category: cleaned.category,
                quantity: cleaned.quantity,
                unitPrice: cleaned.unitPrice,
            },
            {
                returnDocument: 'after',
                runValidators: true,
            }
        );

        await audit(req, { action: 'updated', entity: 'Stock', entityId: req.params.id, summary: `Edited stock item "${cleaned.itemName}": now ${cleaned.quantity} in stock at UGX ${Number(cleaned.unitPrice).toLocaleString('en-US')}.` });
        clearNotificationCache();
        setFlash(req, `Stock item "${cleaned.itemName}" updated successfully.`);
        res.redirect('/registerStock/stockList');

    } catch (error) {
        console.error('Error updating stock:', error);

        const role = req.session?.userRole;
        const stock = await Stock.findById(req.params.id).lean();
        const cleaned = sanitizeStockPayload(req.body);

        return res.status(400).render('editStock', {
            stock: {
                ...(stock || {}),
                ...cleaned,
            },
            permissions: getRolePermissions(role),
            canManageStock: canManageStockByRole(role),
            errorMessage: error.message || 'Error updating stock.',
        });
    }
};

export const deleteStock = async(req, res)=>{
	try {
		const blocker = await whyStockCannotBeDeleted(req.params.id)
		if (blocker) {
			setFlash(req, blocker, 'danger')
			return res.redirect('/registerStock/stockList')
		}
		const removed = await Stock.findByIdAndDelete(req.params.id)
		await audit(req, { action: 'deleted', entity: 'Stock', entityId: req.params.id, summary: `Deleted stock item "${removed?.itemName || 'unknown'}".` })
		clearNotificationCache()
		setFlash(req, 'Stock item deleted.')
		res.redirect('/registerStock/stockList')
	} catch (error) {
		console.error('Error deleting stock', error)
		res.status(500).send('Error deleting stock')
	}
}

export const getStockDetail = async (req, res) => {
	try {
		const stock = await Stock.findById(req.params.id)
			.populate('registeredBy', 'fullName')
			.lean();

		if (!stock) {
			return res.status(404).send('Stock item not found');
		}

		const role = req.session?.userRole;
		res.render('stockDetail', {
			stock,
			permissions: getRolePermissions(role),
			canManageStock: canManageStockByRole(role),
		});
	} catch (error) {
		console.error('Error loading stock detail', error);
		res.status(500).send('Error loading stock detail');
	}
}
