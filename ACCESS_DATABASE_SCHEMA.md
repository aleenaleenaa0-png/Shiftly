# Access Database Schema for Shiftly Project

This document contains the **exact** table structures you need to create in Microsoft Access to match the project's database schema.

## Database File Location
- **File Name**: `ShiftlyDB.accdb`
- **Location**: `C:\Project\Shiftly\DB\ShiftlyDB.accdb` (relative to backend: `..\..\..\..\DB\ShiftlyDB.accdb`)

---

## Table 1: Stores

**Table Name**: `Stores`

| Field Name | Data Type | Field Size | Required | Primary Key | Description |
|------------|-----------|------------|----------|-------------|-------------|
| StoreId | AutoNumber | - | Yes | Yes | Primary Key (Auto-increment) |
| Name | Short Text | 100 | Yes | No | Store name |
| Location | Short Text | 200 | No | No | Store location |
| HourlySalesTarget | Number | Decimal (18,2) | No | No | Target sales per hour |
| HourlyLaborBudget | Number | Decimal (18,2) | No | No | Labor budget per hour |

**Relationships**:
- One Store can have many Employees (Foreign Key: `Employees.StoreId`)
- One Store can have many Users (Foreign Key: `Users.StoreId`)
- One Store can have many Shifts (Foreign Key: `Shifts.Shift_StoreID`)

---

## Table 2: Users (Managers)

**Table Name**: `Users`

| Field Name | Data Type | Field Size | Required | Primary Key | Foreign Key |
|------------|-----------|------------|----------|-------------|-------------|
| UserId | AutoNumber | - | Yes | Yes | - |
| Email | Short Text | 200 | Yes | No | - |
| FullName | Short Text | 100 | Yes | No | - |
| Password | Short Text | 200 | Yes | No | - |
| StoreId | Number | Long Integer | Yes | No | → Stores.StoreId |

**Relationships**:
- Many Users belong to one Store (`StoreId` → `Stores.StoreId`)

**Notes**:
- This table is for **Managers** only
- Employees use the `Employees` table, not this one

---

## Table 3: Employees (Workers)

**Table Name**: `Employees`

| Field Name | Data Type | Field Size | Required | Primary Key | Foreign Key |
|------------|-----------|------------|----------|-------------|-------------|
| EmployeeId | AutoNumber | - | Yes | Yes | - |
| FirstName | Short Text | 50 | Yes | No | - |
| HourlyWage | Number | Decimal (18,2) | Yes | No | - |
| ProductivityScore | Number | Double | Yes | No | - |
| StoreId | Number | Long Integer | Yes | No | → Stores.StoreId |
| Email | Short Text | 200 | No | No | - |

**IMPORTANT - Fields NOT in this table**:
- ❌ `LastName` - Does NOT exist in Access database
- ❌ `Password` - Does NOT exist in Access database

**Relationships**:
- Many Employees belong to one Store (`StoreId` → `Stores.StoreId`)
- One Employee can have many Availabilities (`Availabilities.EmployeeId` → `Employees.EmployeeId`)
- One Employee can be assigned to many Shifts (`Shifts.Shift_EmployeeID` → `Employees.EmployeeId`)

**Notes**:
- `Email` column may be added automatically by the backend if it doesn't exist
- Employees login with `Email` only (no password required)

---

## Table 4: Shifts

**Table Name**: `Shifts`

**IMPORTANT**: The column names in Access use underscores and specific prefixes. Use these **exact** names:

| Field Name | Data Type | Field Size | Required | Primary Key | Foreign Key |
|------------|-----------|------------|----------|-------------|-------------|
| Shift_ID | AutoNumber | - | Yes | Yes | - |
| Shift_StoreID | Number | Long Integer | Yes | No | → Stores.StoreId |
| Shift_StartTime | Date/Time | - | Yes | No | - |
| Shift_EndTime | Date/Time | - | Yes | No | - |
| Shift_ReqThroughput | Number | Decimal (18,2) | Yes | No | - |
| Shift_EmployeeID | Number | Long Integer | No | No | → Employees.EmployeeId |

**IMPORTANT - Field NOT in this table**:
- ❌ `MatchScore` - Does NOT exist in Access database

**Relationships**:
- Many Shifts belong to one Store (`Shift_StoreID` → `Stores.StoreId`)
- One Shift can optionally be assigned to one Employee (`Shift_EmployeeID` → `Employees.EmployeeId`, nullable)
- One Shift can have many Availabilities (`Availabilities.ShiftId` → `Shifts.Shift_ID`)

**Notes**:
- `Shift_EmployeeID` is **nullable** (can be NULL) - this means the shift is unassigned
- Column names must match exactly: `Shift_ID`, `Shift_StoreID`, `Shift_StartTime`, `Shift_EndTime`, `Shift_ReqThroughput`, `Shift_EmployeeID`

---

## Table 5: Availabilities

**Table Name**: `Availabilities`

| Field Name | Data Type | Field Size | Required | Primary Key | Foreign Key |
|------------|-----------|------------|----------|-------------|-------------|
| AvailabilityID | AutoNumber | - | Yes | Yes | - |
| EmployeeId | Number | Long Integer | Yes | No | → Employees.EmployeeId |
| ShiftId | Number | Long Integer | Yes | No | → Shifts.Shift_ID |
| IsAvailable | Yes/No | - | Yes | No | - |

**Relationships**:
- Many Availabilities belong to one Employee (`EmployeeId` → `Employees.EmployeeId`)
- Many Availabilities belong to one Shift (`ShiftId` → `Shifts.Shift_ID`)

**Unique Constraint**:
- **CRITICAL**: Create a unique index on `(EmployeeId, ShiftId)` to prevent duplicate availability records
- This ensures each employee can only have ONE availability record per shift

**Notes**:
- `IsAvailable` is a **Yes/No** (Boolean) field in Access
- This table creates a many-to-many relationship between Employees and Shifts
- The unique constraint ensures: One Employee + One Shift = One Availability record

---

## How to Create These Tables in Microsoft Access

### Step 1: Create the Database File
1. Open Microsoft Access
2. Create a new blank database
3. Save it as `ShiftlyDB.accdb` in `C:\Project\Shiftly\DB\` folder

### Step 2: Create Tables (In Order)

**IMPORTANT**: Create tables in this order to avoid foreign key errors:
1. **Stores** (no dependencies)
2. **Users** (depends on Stores)
3. **Employees** (depends on Stores)
4. **Shifts** (depends on Stores and Employees)
5. **Availabilities** (depends on Employees and Shifts)

### Step 3: Create Relationships

1. Go to **Database Tools** → **Relationships**
2. Add all tables to the Relationships window
3. Create the following relationships:

#### Stores Relationships:
- `Stores.StoreId` → `Users.StoreId` (One-to-Many)
- `Stores.StoreId` → `Employees.StoreId` (One-to-Many)
- `Stores.StoreId` → `Shifts.Shift_StoreID` (One-to-Many)

#### Employees Relationships:
- `Employees.EmployeeId` → `Shifts.Shift_EmployeeID` (One-to-Many, optional)
- `Employees.EmployeeId` → `Availabilities.EmployeeId` (One-to-Many)

#### Shifts Relationships:
- `Shifts.Shift_ID` → `Availabilities.ShiftId` (One-to-Many)

**Enforce Referential Integrity**: Check this box for all relationships

### Step 4: Create Unique Index on Availabilities

1. Open the `Availabilities` table in Design View
2. Go to **Design** tab → **Indexes**
3. Create a new index:
   - **Index Name**: `UniqueEmployeeShift`
   - **Field Names**: `EmployeeId`, `ShiftId`
   - **Unique**: Yes
   - **Primary**: No

### Step 5: Verify Field Types

**Important Data Types in Access**:
- **AutoNumber** = Auto-incrementing number (Primary Keys)
- **Short Text** = Text field (specify Field Size)
- **Number** → **Long Integer** = Integer (for Foreign Keys)
- **Number** → **Decimal** = Decimal with 18,2 precision (for HourlyWage, HourlySalesTarget, etc.)
- **Number** → **Double** = Double precision (for ProductivityScore)
- **Date/Time** = DateTime (for Shift_StartTime, Shift_EndTime)
- **Yes/No** = Boolean (for IsAvailable)

---

## SQL CREATE TABLE Statements (For Reference)

If you prefer to use SQL, here are the exact CREATE TABLE statements:

```sql
-- Stores Table
CREATE TABLE Stores (
    StoreId AUTOINCREMENT PRIMARY KEY,
    Name TEXT(100) NOT NULL,
    Location TEXT(200),
    HourlySalesTarget DECIMAL(18,2),
    HourlyLaborBudget DECIMAL(18,2)
);

-- Users Table
CREATE TABLE Users (
    UserId AUTOINCREMENT PRIMARY KEY,
    Email TEXT(200) NOT NULL,
    FullName TEXT(100) NOT NULL,
    Password TEXT(200) NOT NULL,
    StoreId INTEGER NOT NULL
);

-- Employees Table
CREATE TABLE Employees (
    EmployeeId AUTOINCREMENT PRIMARY KEY,
    FirstName TEXT(50) NOT NULL,
    HourlyWage DECIMAL(18,2) NOT NULL,
    ProductivityScore DOUBLE NOT NULL,
    StoreId INTEGER NOT NULL,
    Email TEXT(200)
);

-- Shifts Table
CREATE TABLE Shifts (
    Shift_ID AUTOINCREMENT PRIMARY KEY,
    Shift_StoreID INTEGER NOT NULL,
    Shift_StartTime DATETIME NOT NULL,
    Shift_EndTime DATETIME NOT NULL,
    Shift_ReqThroughput DECIMAL(18,2) NOT NULL,
    Shift_EmployeeID INTEGER
);

-- Availabilities Table
CREATE TABLE Availabilities (
    AvailabilityID AUTOINCREMENT PRIMARY KEY,
    EmployeeId INTEGER NOT NULL,
    ShiftId INTEGER NOT NULL,
    IsAvailable YESNO NOT NULL,
    CONSTRAINT UniqueEmployeeShift UNIQUE (EmployeeId, ShiftId)
);
```

---

## Quick Checklist

- [ ] Created `ShiftlyDB.accdb` file in `C:\Project\Shiftly\DB\`
- [ ] Created `Stores` table with 5 fields
- [ ] Created `Users` table with 5 fields
- [ ] Created `Employees` table with 6 fields (NO LastName, NO Password)
- [ ] Created `Shifts` table with 6 fields (exact column names with underscores)
- [ ] Created `Availabilities` table with 4 fields
- [ ] Set up all foreign key relationships
- [ ] Created unique index on `Availabilities(EmployeeId, ShiftId)`
- [ ] Verified all data types match the schema above
- [ ] Tested connection from backend (restart backend server)

---

## Troubleshooting

### "No value given for one or more required parameters"
- Check that all column names match **exactly** (case-sensitive, underscores, etc.)
- Verify that `Shifts` table uses `Shift_ID`, `Shift_StoreID`, etc. (not `ShiftId`, `StoreId`)

### "Unknown field name"
- Make sure `Employees` table does NOT have `LastName` or `Password` columns
- Make sure `Shifts` table does NOT have `MatchScore` column
- Verify all field names match the schema exactly

### Foreign Key Errors
- Ensure `Stores` table is created first
- Ensure all foreign key fields reference existing primary keys
- Check that data types match (Long Integer for foreign keys)

### Unique Constraint Errors
- Make sure the unique index on `Availabilities(EmployeeId, ShiftId)` is created
- This prevents duplicate availability records

---

## Notes

1. **No Password on Database**: The database file itself should NOT have a password. The connection string is just `Data Source=...`

2. **Email Column**: The `Email` column in `Employees` table may be added automatically by the backend if missing, but it's better to create it manually.

3. **Column Names Matter**: Access is case-insensitive but the exact column names (especially for `Shifts` table) must match what's in the code.

4. **Data Types**: Use the exact data types specified. Access's "Number" type has subtypes (Long Integer, Decimal, Double) - make sure you select the correct one.

5. **AutoNumber**: Primary keys should be AutoNumber type, which auto-increments.

