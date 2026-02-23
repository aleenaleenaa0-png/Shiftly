import React, { useState, useEffect } from 'react';

interface BackendUser {
  userId: number;
  email: string;
  fullName: string;
  password?: string;
  storeId: number;
  storeName?: string;
}

interface Store {
  storeId: number;
  name: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<BackendUser | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    password: '',
    storeId: 1
  });

  // Fetch users from backend
  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/users', {
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
      // Map backend response to frontend format
      const mappedUsers = data.map((user: any) => ({
        userId: user.UserId || user.userId,
        email: user.Email || user.email,
        fullName: user.FullName || user.fullName,
        storeId: user.StoreId || user.storeId,
        storeName: user.StoreName || user.storeName
      }));
      
      setUsers(mappedUsers);
      setError(null);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load users';
      setError(errorMessage);
      console.error('Error fetching users:', err);
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
    fetchUsers();
    fetchStores();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'storeId' 
        ? parseFloat(value) || 0 
        : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingUser 
        ? `/api/users/${editingUser.userId}`
        : '/api/users';
      
      const method = editingUser ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: formData.email,
          fullName: formData.fullName,
          password: formData.password,
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

      // Refresh user list
      await fetchUsers();
      resetForm();
      alert(editingUser ? 'User updated successfully!' : 'User added successfully!');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      console.error('Error saving user:', err);
    }
  };

  const handleEdit = (user: BackendUser) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      fullName: user.fullName,
      password: '', // Don't show password when editing
      storeId: user.storeId
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 503) {
          const data = await response.json();
          throw new Error(data.message || 'Database is locked');
        }
        throw new Error(`HTTP ${response.status}`);
      }

      await fetchUsers();
      alert('User deleted successfully!');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      console.error('Error deleting user:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      fullName: '',
      password: '',
      storeId: stores.length > 0 ? stores[0].storeId : 1
    });
    setEditingUser(null);
    setShowForm(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900 mb-2">User Management</h1>
            <p className="text-slate-500">Add, edit, and manage manager accounts</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 transition-all flex items-center space-x-2"
          >
            <i className="fas fa-plus"></i>
            <span>Add User</span>
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
                  {editingUser ? 'Edit User' : 'Add New User'}
                </h2>
                <button
                  onClick={resetForm}
                  className="text-slate-400 hover:text-slate-600 text-xl"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    disabled={!!editingUser}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all hover:border-indigo-300 disabled:bg-slate-100 disabled:cursor-not-allowed"
                    placeholder="user@example.com"
                  />
                  {editingUser && (
                    <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all hover:border-indigo-300"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Password {editingUser ? '(leave blank to keep current)' : '*'}
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required={!editingUser}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all hover:border-indigo-300"
                    placeholder={editingUser ? "Enter new password" : "Enter password"}
                  />
                  {editingUser && (
                    <p className="text-xs text-slate-500 mt-1">Only enter a password if you want to change it</p>
                  )}
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
                    {editingUser ? 'Update User' : 'Add User'}
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

        {/* Users List */}
        {loading ? (
          <div className="text-center py-12">
            <i className="fas fa-spinner fa-spin text-4xl text-indigo-500 mb-4"></i>
            <p className="text-slate-500">Loading users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <i className="fas fa-user-shield text-6xl text-slate-300 mb-4"></i>
            <h3 className="text-xl font-bold text-slate-700 mb-2">No users found</h3>
            <p className="text-slate-500 mb-6">Get started by adding your first manager user</p>
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all"
            >
              Add User
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Store</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.userId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">
                          {user.fullName}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {user.email}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-slate-600">
                          {user.storeName || `Store #${user.storeId}`}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(user)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => handleDelete(user.userId)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagement;

