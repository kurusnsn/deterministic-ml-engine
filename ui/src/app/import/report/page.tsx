"use client";
import React, { useState } from 'react';

const Page = () => {
  const [isModalOpen, setIsModalOpen] = useState(false); // State to control modal visibility

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  return (
    <div className="min-h-screen bg-gray-100 font-sans antialiased flex flex-col items-center py-8">
      <div className="w-full max-w-6xl bg-white rounded-lg shadow-md overflow-hidden">
        {/* Navigation Tabs */}
        <nav className="border-b border-gray-200">
          <ul className="flex text-sm font-medium text-gray-500">
            <li className="px-6 py-3 border-b-2 border-transparent hover:border-gray-300 cursor-pointer">
              My Statistics
            </li>
            <li className="px-6 py-3 border-b-2 border-purple-600 text-purple-600 cursor-pointer">
              Scouting
            </li>
            <li className="px-6 py-3 border-b-2 border-transparent hover:border-gray-300 cursor-pointer">
              Game History
            </li>
          </ul>
        </nav>

        {/* Main Content Area */}
        <div className="p-8">
          {/* Welcome Section */}
          <div className="bg-purple-50 p-6 rounded-lg mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Welcome to Scouting</h2>
            <p className="text-gray-600 mb-4">
              Here you can create 40-game analysis reports for yourself, your opponents, or your friends.
              You can also get a Full Report on your performance over longer time periods on My Statistics page.
            </p>
            <div className="flex items-center space-x-4">
              <button
                onClick={openModal} // Attach onClick handler to open modal
                className="bg-purple-600 text-white px-5 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition duration-150 ease-in-out"
              >
                CREATE REPORT
              </button>
              <span className="text-sm text-gray-500">2 more reports available</span>
            </div>
          </div>

          {/* Reports Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tl-lg">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Username
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time class
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total games
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Version
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tr-lg">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 flex items-center">
                    <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Report is ready
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Magnus Carlsen</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">chess.com</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Rapid</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">40</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">v.7</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">2 days ago</td>
                </tr>
                {/* Add more rows as needed */}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          {/* Modal Content */}
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Create report</h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Website Dropdown */}
              <div>
                <label htmlFor="website" className="block text-sm font-medium text-gray-700 mb-1">
                  Website
                </label>
                <div className="relative">
                  <select
                    id="website"
                    name="website"
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm rounded-md"
                    defaultValue="chess.com"
                  >
                    <option>chess.com</option>
                    <option>lichess.org</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                      <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 6.757 7.586 5.343 9z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Username Input */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                  defaultValue="Magnus Carlsen" // Updated placeholder
                />
              </div>

              {/* Time control Dropdown */}
              <div>
                <label htmlFor="time-control" className="block text-sm font-medium text-gray-700 mb-1">
                  Time control
                </label>
                <div className="relative">
                  <select
                    id="time-control"
                    name="time-control"
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm rounded-md"
                    defaultValue="Rapid"
                  >
                    <option>Rapid</option>
                    <option>Blitz</option>
                    <option>Bullet</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                      <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 6.757 7.586 5.343 9z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Continue Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={closeModal} // For now, just closes the modal
                className="bg-purple-600 text-white px-5 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition duration-150 ease-in-out w-full"
              >
                CONTINUE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Page;
