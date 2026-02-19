import React, { useState, useEffect } from 'react';

interface BackendEmployee {
  employeeId: number;
  firstName: string;
  lastName: string;
  hourlyWage: number;
  productivityScore: number;
  storeId: number;
  storeName?: string;
  fullName?: string;
}

interface Store {
  storeId: number;
  name: string;
}

const EmployeeManagement: React.FC = () => {
  const [employees, setEmployees] = useState<BackendEmployee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<BackendEmployee | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    hourlyWage: 0,
    productivityScore: 0,
    storeId: 1
  });

  // Fetch employees from backend
  const fetchEmployees = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/employees', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 503) {
          throw new Error(errorData.message || 'Database is locked');
        }
        if (response.status === 500) {
          throw new Error(errorData.message || errorData.error || `Server error: ${response.status}`);
        }
        throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      // Map backend response to frontend format (handle capitalized property names)
      const mappedEmployees = data.map((emp: any) => ({
        employeeId: emp.EmployeeId || emp.employeeId,
        firstName: emp.FirstName || emp.firstName,
        lastName: emp.LastName || emp.lastName,
        hourlyWage: emp.HourlyWage || emp.hourlyWage,
        productivityScore: emp.ProductivityScore || emp.productivityScore,
        storeId: emp.StoreId || emp.storeId,
        storeName: emp.StoreName || emp.storeName,
        fullName: emp.FullName || emp.fullName
      }));
      
      setEmployees(mappedEmployees);
      setError(null);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load employees';
      setError(errorMessage);
      console.error('Error fetching employees:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch stores from backend
  const fetchStores = async () => {
    try {
      const response = await fetch('/api/stores', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        // Map backend response to frontend format
        const mappedStores = data.map((s: any) => ({
          storeId: s.StoreId || s.storeId,
          name: s.Name || s.name
        }));
        setStores(mappedStores);
        if (mappedStores.length > 0 && !formData.storeId) {
          setFormData(prev => ({ ...prev, storeId: mappedStores[0].storeId }));
        }
      }
    } catch (err) {
      console.error('Error fetching stores:', err);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchStores();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'hourlyWage' || name === 'productivityScore' || name === 'storeId' 
        ? parseFloat(value) || 0 
        : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingEmployee 
        ? `/api/employees/${editingEmployee.employeeId}`
        : '/api/employees';
      
      const method = editingEmployee ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          hourlyWage: formData.hourlyWage,
          productivityScore: formData.productivityScore,
          storeId: formData.storeId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 503) {
          throw new Error(errorData.message || 'Database is locked');
        }
        if (response.status === 400) {
          throw new Error(errorData.error || 'Invalid input. Please check your information.');
        }
        const errorMsg = errorData.message || errorData.error || `Server error: ${response.status}`;
        console.error('Error response:', errorData);
        throw new Error(errorMsg);
      }

      // Refresh employee list
      await fetchEmployees();
      resetForm();
      alert(editingEmployee ? 'Employee updated successfully!' : 'Employee added successfully!');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      console.error('Error saving employee:', err);
    }
  };

  const handleEdit = (employee: BackendEmployee) => {
    setEditingEmployee(employee);
    setFormData({
      firstName: employee.firstName,
      lastName: employee.lastName,
      hourlyWage: employee.hourlyWage,
      productivityScore: employee.productivityScore,
      storeId: employee.storeId
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this employee?')) {
      return;
    }

    try {
      const response = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        if (response.status === 503) {
          const data = await response.json();
          throw new Error(data.message || 'Database is locked');
        }
        throw new Error(`HTTP ${response.status}`);
      }

      await fetchEmployees();
      alert('Employee deleted successfully!');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      console.error('Error deleting employee:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      hourlyWage: 0,
      productivityScore: 0,
      storeId: stores.length > 0 ? stores[0].storeId : 1
    });
    setEditingEmployee(null);
    setShowForm(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900 mb-2">Employee Management</h1>
            <p className="text-slate-500">Add, edit, and manage your workforce</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-600 hover:from-blue-700 hover:via-blue-600 hover:to-cyan-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all flex items-center space-x-2"
          >
            <i className="fas fa-plus"></i>
            <span>Add Employee</span>
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center space-x-3">
            <i className="fas fa-exclamation-circle text-red-500"></i>
            <span className="text-red-700 font-medium">{error}</span>
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">
                  {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                </h2>
                <button
                  onClick={resetForm}
                  className="text-slate-400 hover:text-slate-600 text-xl"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      First Name *
                    </label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-blue-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-blue-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Hourly Wage ($) *
                    </label>
                    <input
                      type="number"
                      name="hourlyWage"
                      value={formData.hourlyWage}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      required
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-blue-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Productivity Score (0-10) *
                    </label>
                    <input
                      type="number"
                      name="productivityScore"
                      value={formData.productivityScore}
                      onChange={handleInputChange}
                      min="0"
                      max="10"
                      step="0.1"
                      required
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-blue-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Store *
                  </label>
                  <select
                    name="storeId"
                    value={formData.storeId}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    {stores.map(store => (
                      <option key={store.storeId} value={store.storeId}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all"
                  >
                    {editingEmployee ? 'Update Employee' : 'Add Employee'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Employees List */}
        {loading ? (
          <div className="text-center py-12">
            <i className="fas fa-spinner fa-spin text-4xl text-blue-500 mb-4"></i>
            <p className="text-slate-500">Loading employees...</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <i className="fas fa-users text-6xl text-slate-300 mb-4"></i>
            <h3 className="text-xl font-bold text-slate-700 mb-2">No employees found</h3>
            <p className="text-slate-500 mb-6">Get started by adding your first employee</p>
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all"
            >
              Add Employee
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Store</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Hourly Wage</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Productivity</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map((employee) => {
                    const scoreColor = employee.productivityScore > 8 ? 'bg-green-100 text-green-700' :
                                      employee.productivityScore > 6 ? 'bg-orange-100 text-orange-700' :
                                      'bg-red-100 text-red-700';

                    return (
                      <tr key={employee.employeeId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">
                            {employee.fullName || `${employee.firstName} ${employee.lastName}`}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {employee.storeName || `Store #${employee.storeId}`}
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900">${employee.hourlyWage.toFixed(2)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${scoreColor}`}>
                            {employee.productivityScore.toFixed(1)}/10
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => handleEdit(employee)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            <button
                              onClick={() => handleDelete(employee.employeeId)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeManagement;

