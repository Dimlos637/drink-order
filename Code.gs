/**
 * 我喝故我在? 造型飲料點餐系統 - 2026 終極手動管理版
 * [功能整合]
 * 1. 手動控制：開啟/關閉/歸檔 (試算表上方選單)
 * 2. 50嵐規則：單價 > 35 加料免費 (H 欄價格歸零)
 * 3. VVIP 邏輯：自動判斷請客模式，帳目自動平衡
 * 4. 自我撤回：使用者可在網頁端撤回最後一筆訂單
 */

// --- 1. 建立自定義管理選單 ---
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('☕ 飲料系統管理')
      .addItem('📢 啟動系統 (設為開啟)', 'manualOpen')
      .addItem('🛑 關閉系統 (設為關閉)', 'manualClose')
      .addSeparator()
      .addItem('🔙 撤銷最後一筆訂單 (主揪用)', 'deleteLastOrder')
      .addSeparator()
      .addItem('📥 結算並歸檔今日訂單', 'manualArchive')
      .addToUi();
  
  setupValidation();
}

// --- 2. 網頁 API：提供資料給 GitHub 前端 ---
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const menuSheet = ss.getSheetByName('Menu');
  const vvipSheet = ss.getSheetByName('VVIP');
  
  const status = menuSheet.getRange('G2').getValue(); 
  const restaurant = menuSheet.getRange('I2').getValue(); 
  
  // 抓取飲品菜單
  const menuData = menuSheet.getRange(2, 1, menuSheet.getLastRow(), 3).getValues()
                            .filter(r => r[0] !== "" && r[0] !== null);
  // 抓取加料清單
  const extraData = menuSheet.getRange(2, 5, menuSheet.getLastRow(), 2).getValues()
                             .filter(r => r[0] !== "" && r[0] !== null);
  // 抓取 VVIP 名單
  let vvipList = [];
  if (vvipSheet && vvipSheet.getLastRow() >= 2) {
    vvipList = vvipSheet.getRange(2, 1, vvipSheet.getLastRow() - 1, 1).getValues().flat();
  }

  return ContentService.createTextOutput(JSON.stringify({ 
    status: status, 
    restaurant: restaurant, 
    menu: menuData, 
    extras: extraData, 
    vvip: vvipList 
  })).setMimeType(ContentService.MimeType.JSON);
}

// --- 3. 訂單處理：新增與自我撤回邏輯 ---
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Orders');
    const menuSheet = ss.getSheetByName('Menu');
    
    // 安全檢查：若系統已關閉，拒絕任何 POST 請求 (防止透過 API 強行下單)
    const currentStatus = menuSheet.getRange('G2').getValue();
    if (currentStatus !== "開啟" && data.action !== "delete") {
      return ContentService.createTextOutput(JSON.stringify({ "result": "抱歉，系統目前已關閉，無法收單。" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // --- A. 撤回功能邏輯 ---
    if (data.action === "delete") {
      const rows = sheet.getDataRange().getValues();
      const userName = data.userName.trim();
      // 從後往前找，刪除該使用者最後一筆訂單
      for (let i = rows.length - 1; i >= 1; i--) {
        // 去除姓名中的單引號進行比對
        if (rows[i][1].toString().replace(/'/g, "") === userName) {
          sheet.deleteRow(i + 1);
          return ContentService.createTextOutput(JSON.stringify({ "result": "已成功撤回您的最後一筆訂單！" }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ "result": "在今日訂單中找不到您的名字。" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // --- B. 新增訂單邏輯 ---
    const vvipSheet = ss.getSheetByName('VVIP');
    let vvipList = [];
    if (vvipSheet && vvipSheet.getLastRow() >= 2) {
      vvipList = vvipSheet.getRange(2, 1, vvipSheet.getLastRow() - 1, 1).getValues().flat();
    }
    const isVVIP = vvipList.includes(data.userName.trim());

    let basePrice = Number(data.price);
    let toppingPrice = Number(data.extraPrice) || 0;
    let qty = Number(data.quantity) || 1;

    // 50嵐特殊規則：單價超過 35 元加料免費
    if (basePrice > 35) { toppingPrice = 0; }
    const totalPrice = (basePrice + toppingPrice) * qty;

    // 處理 VVIP 財務 (實收金額等於總價，繳費設為「是」)
    let finalReceived = isVVIP ? totalPrice : (Number(data.receivedAmount) || 0);
    let finalPaid = isVVIP ? "是" : (data.hasPaid ? "是" : "否");
    let finalNote = isVVIP ? "【✨ 老大請客】" + data.note : data.note;

    sheet.appendRow([
      new Date(), "'" + data.userName, data.item, data.ice, data.sugar,
      data.extraItem, basePrice, toppingPrice, qty, totalPrice,
      finalPaid, finalReceived, finalNote
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ 
      "result": isVVIP ? "恭喜解鎖『白嫖模式』！我喝故我在。" : "下單成功！我喝故我在。" 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ "result": "錯誤：" + err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --- 4. 管理功能函式 ---

function manualOpen() {
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Menu').getRange('G2').setValue('開啟');
  SpreadsheetApp.getUi().alert('系統已啟動！大家可以開始白嫖了。');
}

function manualClose() {
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Menu').getRange('G2').setValue('關閉');
  SpreadsheetApp.getUi().alert('系統已關閉！您可以開始結算帳目。');
}

function deleteLastOrder() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('⚠️ 確認撤銷？', '將會刪除最後一筆訂單。', ui.ButtonSet.YES_NO);
  if (response == ui.Button.YES) { sheet.deleteRow(lastRow); }
}

function manualArchive() {
  const ui = SpreadsheetApp.getUi();
  const orderSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");
  if (orderSheet.getLastRow() < 2) { ui.alert('目前沒有訂單。'); return; }

  const response = ui.alert('⚠️ 確認歸檔？', '這會清空 Orders 並讓 Summary 歸零！', ui.ButtonSet.YES_NO);
  if (response == ui.Button.YES) {
    const historySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("History");
    const data = orderSheet.getRange(2, 1, orderSheet.getLastRow() - 1, 13).getValues();
    historySheet.getRange(historySheet.getLastRow() + 1, 1, data.length, 13).setValues(data);
    orderSheet.getRange(2, 1, orderSheet.getLastRow() - 1, 13).clearContent();
    ui.alert('歸檔完成！');
  }
}

// 當 Menu!I2 變動時自動搬運菜單
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() === "Menu" && range.getA1Notation() === "I2") {
    const resName = range.getValue();
    if (!resName) return;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSheet = ss.getSheetByName(resName);
    if (sourceSheet) {
      sheet.getRange("A2:C100").clearContent();
      sheet.getRange("E2:F100").clearContent();
      const lastR = sourceSheet.getLastRow();
      if (lastR > 1) {
        const menuData = sourceSheet.getRange(2, 1, lastR - 1, 3).getValues();
        sheet.getRange(2, 1, menuData.length, 3).setValues(menuData);
        const extraData = sourceSheet.getRange(2, 4, lastR - 1, 2).getValues().filter(row => row[0] !== "");
        if (extraData.length > 0) { sheet.getRange(2, 5, extraData.length, 2).setValues(extraData); }
      }
    }
  }
}

function setupValidation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const menuSheet = ss.getSheetByName("Menu");
  const exclude = ["Menu", "Orders", "Summary", "History", "VVIP"];
  const resNames = ss.getSheets().map(s => s.getName()).filter(n => !exclude.includes(n));
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(resNames).build();
  menuSheet.getRange("I2").setDataValidation(rule);
}
