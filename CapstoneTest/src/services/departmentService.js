import { ref, get, set, remove, push } from 'firebase/database';
import { database, dbRef } from '../firebase';

// functions for managing departments
async function getDepartments() {
	try {
		const snapshot = await get(ref(database, dbRef('departments')));
		if (!snapshot.exists()) return [];
		const val = snapshot.val();
		return Object.entries(val).map(([id, dept]) => ({ id, ...dept }));
	} catch (error) {
		console.error('Failed to get departments:', error);
		throw error;
	}
}

async function saveDepartment(department) {
	try {
		let id = department.id;
		if (!id) {
			// Create new department
			const newRef = push(ref(database, dbRef('departments')));
			id = newRef.key;
			await set(newRef, { ...department, id });
			return { ...department, id };
		} else {
			// Update existing department
			const nodeRef = ref(database, dbRef(`departments/${id}`));
			await set(nodeRef, { ...department, id });
			return { ...department, id };
		}
	} catch (error) {
		console.error('Failed to save department:', error);
		throw error;
	}
}

async function deleteDepartment(id) {
	if (!id) throw new Error('Missing department id');
	try {
		const nodeRef = ref(database, dbRef(`departments/${id}`));
		await remove(nodeRef);
		return true;
	} catch (error) {
		console.error('Failed to delete department:', error);
		throw error;
	}
}

export { getDepartments, saveDepartment, deleteDepartment };

