import notify from './notify'
import { ipcRenderer } from 'electron'
import holidays from '../../data/holidays'

// 每天打卡存储
const CLOCK_STORE = new Map()

export default injector => {
  let oldCount = 0
  injector.setTimer(() => {
    let count = 0
    const $mainMenus = document.querySelector('#menu-pannel>.main-menus')
    if ($mainMenus) {
      const $menuItems = $mainMenus.querySelectorAll('li.menu-item')
      $menuItems.forEach($item => {
        const $unread = $item.querySelector('all-conv-unread-count em.ng-binding')
        if ($unread) {
          const badge = parseInt($unread.innerText)
          count += isNaN(badge) ? 0 : badge
        }
      })
    }
    if (oldCount !== count) {
      // 当有新消息来时才发送提示信息
      if (count !== 0 && oldCount < count) {
        const msg = `您有${count}条消息未查收！`
        /**
         * 尝试修复linux消息导致系统崩溃问题
         * https://github.com/nashaofu/dingtalk/issues/176
         */
        if (process.platform === 'linux') {
          notify(msg)
        } else {
          ipcRenderer.send('notify', msg)
        }
      }
      oldCount = count
      ipcRenderer.send('MAINWIN:badge', count)
    }

    // 打卡通知 (工作日才提醒)
    const toDayStr = format(new Date(), 'yyyyMMdd')
    const workDay = holidays.find(x => x.dayStr === toDayStr && x.type === '0')
    if (workDay) {
      debugger
      handleClockNotify(null, null, null)
    }
  })
}

function handleClockNotify (clockTime, clockDesc, markdownHtml) {
  const nowDate = new Date()
  const clockDate = clockTime || nowDate
  const nowYear = nowDate.getFullYear()
  const nowMonth = nowDate.getMonth()
  const nowDay = nowDate.getDate()

  if (clockDate >= new Date(nowYear, nowMonth, nowDay, 8, 25, 0, 0) && clockDate <= new Date(nowYear, nowMonth, nowDay, 8, 30, 0, 0)) {
    clockDesc = clockDesc || '上午上班打卡'
    clockTime ? handleClockFinished(nowDate.getHours() === 8, clockDesc, markdownHtml) : handleClockData(clockDesc)
  } else if (clockDate >= new Date(nowYear, nowMonth, nowDay, 12, 0, 0, 0) && clockDate <= new Date(nowYear, nowMonth, nowDay, 12, 5, 0, 0)) {
    clockDesc = clockDesc || '上午下班打卡'
    clockTime ? handleClockFinished(nowDate.getHours() === 12, clockDesc, markdownHtml) : handleClockData(clockDesc)
  } else if (clockDate >= new Date(nowYear, nowMonth, nowDay, 13, 0, 0, 0) && clockDate <= new Date(nowYear, nowMonth, nowDay, 13, 5, 0, 0)) {
    clockDesc = clockDesc || '下午上班打卡'
    clockTime ? handleClockFinished(nowDate.getHours() === 13, clockDesc, markdownHtml) : handleClockData(clockDesc)
  } else if (clockDate >= new Date(nowYear, nowMonth, nowDay, 18, 0, 0, 0) && clockDate <= new Date(nowYear, nowMonth, nowDay, 18, 5, 0, 0)) {
    clockDesc = clockDesc || '下午下班打卡'
    clockTime ? handleClockFinished(nowDate.getHours() >= 18, clockDesc, markdownHtml) : handleClockData(clockDesc)
  } else {
    clockTime ? handleClockFinished(false, clockDesc, markdownHtml) : handleClockData(null)
  }
}

function handleClockData (clockDesc) {
  if (clockDesc) {
    if (CLOCK_STORE.has(clockDesc + true)) {
      return
    }
    // else if (CLOCK_STORE.has(clockDesc + false)) {
    //   const lastQueryTime = CLOCK_STORE.get(clockDesc + false)
    //   // 1分钟内
    //   if (Date.now() - lastQueryTime < 1000 * 60) {
    //     return
    //   }
    // }
    const kadNotifyTitle = '工作通知:广东康爱多数字健康科技有限公司'
    const msgTitles = document.querySelectorAll('#sub-menu-pannel conv-item .name-title')
    if (msgTitles) {
      const currMsgPannel = document.querySelector('#content-pannel .conv-title .title > span > span')
      if (currMsgPannel && currMsgPannel.innerText === kadNotifyTitle) {
        const msgCards = document.querySelectorAll('.msg-action-card .card-link-container .markdown-content')
        if (msgCards && msgCards.length > 0) {
          const lastMsgCard = msgCards[msgCards.length - 1]
          const msgCardTitle = lastMsgCard.querySelector('h3').innerText
          const msgCardTime = lastMsgCard.querySelector('h6').innerText
          const markdownHtml = lastMsgCard.innerHTML

          const clockTime = new Date(
            new Date().getFullYear(),
            Number(msgCardTime.substr(0, 2)) - 1,
            Number(msgCardTime.substr(3, 2)),
            Number(msgCardTitle.substr(0, 2)),
            Number(msgCardTitle.substr(3, 2))
          )
          handleClockNotify(clockTime, clockDesc, markdownHtml)
        }
      } else {
        Array.from(msgTitles).forEach(msgTitle => {
          if (msgTitle.innerText.includes(kadNotifyTitle)) {
            msgTitle.click()
          }
        })
      }
    }
  } else {
    CLOCK_STORE.clear()
  }
}

function handleClockFinished (isSuccess, clockDesc, markdownHtml) {
  if (!isSuccess) {
    const lastQueryTime = CLOCK_STORE.get(clockDesc + false)
    // 1分钟内
    if (Date.now() - lastQueryTime < 1000 * 60) {
      return
    }
  }
  CLOCK_STORE.set(clockDesc + isSuccess, Date.now())
  // 微信通知
  const logDesc = `${clockDesc}:${isSuccess ? '执行成功' : '未执行'}`
  const logDesp = encodeURIComponent('#### 最后1条打卡记录(' + Date.now() + ')：\r\n' + '```html\r\n' + markdownHtml + '\r\n```\r\n')
  console.log(`logDesc：${logDesc}`)
  console.log(`logDesp：${logDesp}`)
  weixinNotify(logDesc, logDesp)
}

function weixinNotify (logDesc, logDesp) {
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  iframe.id = `weixin_notify_${Date.now()}`
  iframe.src = `https://sc.ftqq.com/SCU33276T4801adab529b3595e3dc25d37cbe38a35bb5f40021bbd.send?text=${logDesc}&desp=${logDesp}`
  document.body.append(iframe)
  // 删掉
  setTimeout(() => {
    iframe.remove()
  }, 1000 * 5)
}

/**
 * 格式化时间
 * @param date js Date 实例
 * @param fmt 所需时间格式 y：年份，M：月份，d：日，h：12小时，H：24小时，m：分钟，s：秒，q：季度，f：毫秒
 */
function format (date, fmt) {
  const o = {
    'y+': date.getFullYear(), // 年份
    'M+': date.getMonth() + 1, // 月份
    'd+': date.getDate(), // 日
    'h+': date.getHours() % 12 === 0 ? 12 : date.getHours() % 12, // 12小时制
    'H+': date.getHours(), // 24小时制
    'm+': date.getMinutes(), // 分
    's+': date.getSeconds(), // 秒
    'q+': Math.floor((date.getMonth() + 3) / 3), // 季度
    'f+': date.getMilliseconds() // 毫秒
  }
  for (const k in o) {
    if (new RegExp('(' + k + ')').test(fmt)) {
      fmt = fmt.replace(RegExp.$1, o[k].toString().padStart(RegExp.$1.length, '0'))
    }
  }
  return fmt
}
