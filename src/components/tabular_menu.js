import React, { Component } from 'react'
import { Menu } from 'semantic-ui-react'

export default class MenuExampleTabular extends Component {
  
  constructor(props) {
    super(props);

    this.state = {
      activeItem: 'People'
    }
  }
      // 

  handleItemClick = (e, { name }) => {
    this.setState({ activeItem: name })
    // this.props.setState(activeItem: name)
    this.props.tabSelectCallback(name)
  }

  handleSwitchClick = (identifier) => {
    this.props.setToggle(identifier)
  }

  createTabToggle(text, identifier, activeClass){
    if ( this.state.activeItem === activeClass){
      var classSpecific='menu_visible'
    }else{
      classSpecific='menu_hidden'
    }

    return(
      <span >
      <label className={`switch ${classSpecific}`} >
        <input type="checkbox" onClick={() => this.handleSwitchClick(identifier)}></input>
        <span className={`slider round ${classSpecific}`}></span>
      </label>
      <span className={`switchLabel ${classSpecific}`} >{text}</span>
      </span>
    )

  }

  render() {
    const { activeItem } = this.state

    var peopleState = 'menu_hidden'
    var folderState = 'menu_hidden'
    var toolsState = 'menu_hidden'
    
    if ( activeItem === 'Tools'){
      toolsState = 'menu_visible'
    }
    if ( activeItem === 'Folders'){
      folderState = 'menu_visible'
    }
    if ( activeItem === 'People'){
      peopleState = 'menu_visible'
    }

    return (
    <div className = 'menu'>
      <Menu tabular id='menuBar'>
      
        <Menu.Item
          className="menuTab"
          name='Tools'
          active={activeItem === 'Tools'}
          onClick={this.handleItemClick}
        />
        <Menu.Item
          className="menuTab"
          name='Folders'
          active={activeItem === 'Folders'}
          onClick={this.handleItemClick}
        />
        <Menu.Item
          className="menuTab"
          name='People'
          active={activeItem === 'People'}
          onClick={this.handleItemClick}
        />

        <div id='menuRemnant'>

        <div id='PeopleRemnant' className={`contextMenu ${peopleState}`}>
          {this.createTabToggle('Only Unlabeled Faces', 'unlabeled_toggle', 'People')}
        </div>

        <div id='PeopleRemnant' className={`contextMenu ${peopleState}`}>
          {this.createTabToggle('Only Unverified Faces', 'only_unverified_toggle', 'People')}
        </div>

        <div id='FolderRemnant' className={`contextMenu ${folderState}`}>
          {this.createTabToggle('Faces', 'face', 'Folders')}
        </div>

        <div id='ToolRemnant' className={`contextMenu ${toolsState}`}>
          {this.createTabToggle('Tolta', 'total', 'Tools')}
          {this.createTabToggle('t2', 't2', 'Tools')}
        </div>
        
        </div>
        
      </Menu>
    </div>
    )
  }
}