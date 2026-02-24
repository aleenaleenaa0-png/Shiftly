# Access Database Setup for Availability Feature

## Required Table: `Availabilities`

This table stores employee availability for shifts. Each employee can mark themselves as available or not available for each of the 14 weekly shifts (7 days × 2 shifts per day).

### Table Structure

| Column Name | Data Type | Description | Constraints |
|------------|-----------|-------------|-------------|
| **AvailabilityID** | AutoNumber | Primary Key | Auto-increment, Required |
| **EmployeeId** | Number (Long Integer) | Foreign Key to Employees.EmployeeId | Required, NOT NULL |
| **ShiftId** | Number (Long Integer) | Foreign Key to Shifts.Shift_ID | Required, NOT NULL |
| **IsAvailable** | Yes/No (Boolean) | True = Available, False = Not Available | Required, NOT NULL |

### Relationships

1. **EmployeeId** → References `Employees.EmployeeId`
   - Cascade Delete: When an employee is deleted, their availability records are deleted
   
2. **ShiftId** → References `Shifts.Shift_ID`
   - Cascade Delete: When a shift is deleted, availability records for that shift are deleted

### Unique Constraint

- **EmployeeId + ShiftId** must be unique (one availability record per employee per shift)
- This prevents duplicate availability entries

### How to Create in Access

1. Open your Access database
2. Go to **Create** tab → **Table Design**
3. Add the following fields:

   ```
   Field Name: AvailabilityID
   Data Type: AutoNumber
   Field Properties:
     - Field Size: Long Integer
     - New Values: Increment
   
   Field Name: EmployeeId
   Data Type: Number
   Field Properties:
     - Field Size: Long Integer
     - Required: Yes
     - Indexed: Yes (Duplicates OK)
   
   Field Name: ShiftId
   Data Type: Number
   Field Properties:
     - Field Size: Long Integer
     - Required: Yes
     - Indexed: Yes (Duplicates OK)
   
   Field Name: IsAvailable
   Data Type: Yes/No
   Field Properties:
     - Format: Yes/No
     - Required: Yes
     - Default Value: No (False)
   ```

4. Set **AvailabilityID** as Primary Key:
   - Right-click on AvailabilityID row → **Primary Key**

5. Create the Unique Index for (EmployeeId, ShiftId):
   - Go to **Design** tab → **Indexes**
   - Create a new index:
     - Index Name: `UniqueEmployeeShift`
     - Field Name: `EmployeeId` (Ascending)
     - Field Name: `ShiftId` (Ascending)
     - Unique: Yes

6. Create Foreign Key Relationships:
   - Go to **Database Tools** tab → **Relationships**
   - Add `Availabilities` table
   - Drag `EmployeeId` from `Availabilities` to `EmployeeId` in `Employees` table
     - Check "Enforce Referential Integrity"
     - Check "Cascade Delete Related Records"
   - Drag `ShiftId` from `Availabilities` to `Shift_ID` in `Shifts` table
     - Check "Enforce Referential Integrity"
     - Check "Cascade Delete Related Records"

### SQL to Create Table (if using SQL view)

```sql
CREATE TABLE Availabilities (
    AvailabilityID AUTOINCREMENT PRIMARY KEY,
    EmployeeId INTEGER NOT NULL,
    ShiftId INTEGER NOT NULL,
    IsAvailable YESNO NOT NULL,
    CONSTRAINT UniqueEmployeeShift UNIQUE (EmployeeId, ShiftId),
    CONSTRAINT FK_Availabilities_Employees FOREIGN KEY (EmployeeId) REFERENCES Employees(EmployeeId) ON DELETE CASCADE,
    CONSTRAINT FK_Availabilities_Shifts FOREIGN KEY (ShiftId) REFERENCES Shifts(Shift_ID) ON DELETE CASCADE
);
```

### How It Works

1. **Employee marks availability:**
   - Employee clicks "Available" or "Not Available" for a shift
   - If no record exists: Creates new record with `IsAvailable = true`
   - If record exists: Toggles `IsAvailable` (true ↔ false)

2. **Manager sees availability:**
   - Manager page polls every 3 seconds
   - Shows employees who have `IsAvailable = true` for each shift
   - Manager can only assign employees who are available (`IsAvailable = true`)

3. **Data Flow:**
   - Employee updates → Saved to `Availabilities` table
   - Manager page fetches → Reads from `Availabilities` table where `IsAvailable = true`
   - Assignment → Checks `IsAvailable = true` before allowing assignment

### Example Data

| AvailabilityID | EmployeeId | ShiftId | IsAvailable |
|---------------|------------|---------|-------------|
| 1 | 1 | 5 | Yes (True) |
| 2 | 1 | 6 | No (False) |
| 3 | 2 | 5 | Yes (True) |
| 4 | 2 | 6 | Yes (True) |

This means:
- Employee 1 is available for Shift 5, not available for Shift 6
- Employee 2 is available for both Shift 5 and Shift 6

### Notes

- The code will automatically create this table if it doesn't exist
- However, it's recommended to create it manually in Access to ensure proper relationships
- The unique constraint on (EmployeeId, ShiftId) is enforced by Entity Framework Core
- Foreign key relationships ensure data integrity

