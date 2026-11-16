// src/components/shared/ProfileSettings.jsx
import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { getAuth } from "firebase/auth";
import { ref, get, update, child } from "firebase/database";
import { database, dbRef } from "../../firebase";
import { firebaseService } from "../../services/firebaseService";
import { authService } from "../../services/authService";
import { Edit, Info, Save } from "lucide-react";
import useAuth from "../../contexts/authcontext";
import defaultAvatar from "../../assets/avatar-default.svg";

const ProfileSettings = () => {
  const auth = getAuth();
  const { user: authUser } = useAuth();
  const user = auth.currentUser;
  const role = authUser?.role || "employee";

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [newPassword, setNewPassword] = useState("");
  const [profilePic, setProfilePic] = useState(defaultAvatar);
  const [imageFile, setImageFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) return;
      const username = user.email.split("@")[0];

      try {
        const users = await firebaseService.getUsers();
        for (const v of users) {
          if (!v) continue;
          if (
            String(v.userId) === String(user?.userId) ||
            v.email === user.email ||
            v.facultyId === username ||
            v.id === username
          ) {
            setFullName(v.name || v.faculty_name || "");

            let collegeName = "Unknown Department";
            if (role === "hr") collegeName = "Human Resources";
            else {
              switch (v.department?.toLowerCase()) {
                case "ccs":
                case "computing":
                case "computer science":
                case "information technology":
                  collegeName = "College of Computing Studies";
                  break;
                case "coe":
                case "education":
                  collegeName = "College of Education";
                  break;
                case "cba":
                case "business":
                  collegeName = "College of Business Studies";
                  break;
                case "cas":
                case "arts":
                  collegeName = "College of Arts and Sciences";
                  break;
                case "coe":
                case "engineering":
                  collegeName = "College of Engineering";
                  break;
                case "cot":
                case "technology":
                  collegeName = "College of Technology";
                  break;
                default:
                  collegeName = v.department || "Unknown Department";
              }
            }
            setDepartment(collegeName);

            if (v.profilePicture || v.profile_picture)
              setProfilePic(v.profilePicture || v.profile_picture);
            return;
          }
        }

        const profileRef = child(ref(database), dbRef(`users/${username}`));
        const snapshot = await get(profileRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          setFullName(data.name || data.faculty_name || "");
          setDepartment(
            role === "hr" ? "Human Resources" : data.department || ""
          );
          if (data.profilePicture || data.profile_picture)
            setProfilePic(data.profilePicture || data.profile_picture);
        }
      } catch (err) {
        // ignore errors
      }
    };

    fetchUserProfile();
  }, [user, role]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setImageFile(file);

    const reader = new FileReader();
    reader.onloadend = () => setProfilePic(reader.result); // preview
    reader.readAsDataURL(file);
  };

  const handleUploadImage = async () => {
    if (!imageFile) return;
    setIsUploading(true);
    try {
      const username = user.email.split("@")[0];

      // Fetch all users to map facultyId/username to numeric userId
      const users = await firebaseService.getUsers();
      let userIdToUse = authUser?.userId || username;
      // If userIdToUse is not numeric, try to find numeric userId by matching facultyId or username
      if (isNaN(Number(userIdToUse))) {
        const matchedUser = users.find(
          (u) =>
            u.facultyId === userIdToUse ||
            u.id === userIdToUse ||
            u.email?.split("@")[0] === userIdToUse
        );
        if (matchedUser && matchedUser.userId !== undefined) {
          userIdToUse = String(matchedUser.userId);
        }
      }

      // Read file as base64
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(imageFile);
      });

      // Save Base64 string directly in Firebase
      await update(ref(database, dbRef(`users/${userIdToUse}`)), {
        profilePicture: base64Data,
      });

      setProfilePic(base64Data);
      setImageFile(null);
      setStatusMessage("✅ Profile picture uploaded and saved.");
      return base64Data;
    } catch (err) {
      console.error(err);
      setStatusMessage("❌ Upload failed: " + (err.message || "Unknown error"));
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  const [currentPassword, setCurrentPassword] = useState("");
  const [showChangePassword, setShowChangePassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage("");

    const username = user.email.split("@")[0];

    // Fetch all users to map facultyId/username to numeric userId
    const users = await firebaseService.getUsers();
    let userIdToUse = authUser?.userId || username;
    // If userIdToUse is not numeric, try to find numeric userId by matching facultyId or username
    if (isNaN(Number(userIdToUse))) {
      const matchedUser = users.find(
        (u) =>
          u.facultyId === userIdToUse ||
          u.id === userIdToUse ||
          u.email?.split("@")[0] === userIdToUse
      );
      if (matchedUser && matchedUser.userId !== undefined) {
        userIdToUse = String(matchedUser.userId);
      }
    }

    // If user selected a new image, upload it first (this will persist to Firebase)
    try {
      if (imageFile) {
        await handleUploadImage();
      }
    } catch (err) {
      // handleUploadImage already sets statusMessage on error
      setStatusMessage("Error uploading profile picture. Aborting save.");
      setIsUploading(false);
      return;
    }

    const updates = {};
    if (fullName) updates.name = fullName;
    // If profilePic is already a persistent URL (not data:), include it
    if (profilePic && !profilePic.startsWith("data:")) updates.profilePicture = profilePic;

    try {
      await update(ref(database, dbRef(`users/${userIdToUse}`)), updates);

      if (newPassword && currentPassword) {
        try {
          await authService.changePassword(currentPassword, newPassword);
          setStatusMessage("Password changed successfully.");
          setCurrentPassword("");
          setNewPassword("");
          setShowChangePassword(false);
        } catch (error) {
          setStatusMessage(
            error.message ||
              "Error changing password. Please verify your current password."
          );
          throw error;
        }
      }

      setStatusMessage("Profile updated successfully.");
    } catch (error) {
      setStatusMessage("Error updating profile. Please try again.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto p-6 sm:p-8 bg-white rounded-xl shadow-md border border-gray-100 mt-8"
    >
      <div className="text-center mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">
          Profile Settings
        </h1>
        <p className="text-gray-600 text-lg">
          Manage your account information and preferences
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex flex-col items-center md:items-start md:w-1/3">
          <div className="relative flex justify-center p-4 bg-white rounded-lg shadow-sm border border-gray-100">
            <img
              src={profilePic}
              alt="Profile"
              className="w-40 h-40 md:w-48 md:h-48 rounded-full object-cover border-4 border-red-50 shadow-lg"
            />
            <motion.button
              onClick={() => fileInputRef.current.click()}
              style={{ backgroundColor: 'var(--color-sidebar)' }}
              className="absolute bottom-2 right-2 text-white p-2 rounded-full hover:opacity-90 transition-opacity shadow-md"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              aria-label="Change profile picture"
            >
              <Edit className="w-4 h-4" />
            </motion.button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleImageChange}
            accept="image/*"
          />
          {/* Removed inline Upload/Cancel buttons — upload happens on Save Changes */}
          <h3 className="mt-4 text-lg md:text-xl font-semibold text-gray-800">
            {fullName || "Faculty"}
          </h3>
          <p className="text-gray-500 text-sm">{department || "Department"}</p>
        </div>
        <form className="md:w-2/3" onSubmit={handleSubmit}>
          <div className="p-6 bg-gray-50 rounded-lg border border-gray-100 space-y-6">
          {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <input
                type="text"
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-red-100 focus:border-red-500"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

          {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 cursor-not-allowed"
                value={email}
                disabled
              />
            </div>

          {/* Password Section */}
            <div>
              <button
                type="button"
                onClick={() => setShowChangePassword(!showChangePassword)}
                className="inline-flex items-center text-sm font-medium text-red-600 hover:text-red-700 mb-2"
              >
                {showChangePassword ? "Cancel Password Change" : "Change Password"}
              </button>

              {showChangePassword && (
                <div className="space-y-4 border-l-4 border-red-100 pl-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Current Password
                    </label>
                    <input
                      type="password"
                      className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required={showChangePassword}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      New Password
                    </label>
                    <input
                      type="password"
                      className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required={showChangePassword}
                    />
                  </div>
                </div>
              )}
            </div>

          {/* Department */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Department
              </label>
              <input
                type="text"
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100"
                value={department}
                disabled
                placeholder="Department"
              />
            </div>

          {/* HR Role Info */}
          {role === "hr" && (
            <motion.div className="role-assignment-card border rounded-md p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-full" style={{ backgroundColor: 'transparent' }}>
                  <Info className="w-5 h-5" style={{ color: 'var(--color-role-assignment-text)' }} />
                </div>
                <h3 className="text-lg font-semibold role-assignment-title">HR Privileges</h3>
              </div>
              <p className="text-sm role-assignment-text">
                As an HR, you have access to manage employee profiles and
                attendance records.
              </p>
            </motion.div>
          )}

          {/* Save / Cancel */}
            <div className="flex items-center justify-end mt-6">
              <motion.button
                type="submit"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="approve-button flex items-center gap-2 px-6 py-3 border-2 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                <Save className="w-4 h-4" />
                Save Changes
              </motion.button>
            </div>
          </div>

          {statusMessage && (
            <p
              className={`mt-4 text-sm font-medium ${
                statusMessage.toLowerCase().includes("error")
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {statusMessage}
            </p>
          )}
        </form>
      </div>
    </motion.div>
  );
};

export default ProfileSettings;
